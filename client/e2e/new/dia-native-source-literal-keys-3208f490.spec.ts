import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5311a0cd
 *  Title   : Native Mermaid source editing
 *  Source  : docs/client-features/dia-native-mermaid-source-editing-5311a0cd.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-5311a0cd: native keys keep Diagram source literal", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [""]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
    });

    test("Tab inserts a tab and Ctrl+B leaves the source unformatted", async ({ page }) => {
        const target = page.locator(".outliner-item").nth(1);
        await target.locator(".item-content").click({ force: true });
        await page.waitForTimeout(300);
        await page.keyboard.press("End");
        await page.keyboard.type("/");
        await page.locator('[data-testid="command-item-diagram"]').click();
        await expect(page.locator('[data-testid="diagram-block"]')).toBeVisible({ timeout: 15000 });
        const diagramId = await page.locator('[data-testid="diagram-block"]').getAttribute("data-diagram-id");
        await page.evaluate((id) => {
            (globalThis as any).diagramService.setDiagramSource((globalThis as any).generalStore.project, id, "ab");
        }, diagramId);
        const source = page.locator('[data-testid="diagram-source"]');
        await expect(source).toHaveText("ab", { timeout: 10000 });

        const readSource = () =>
            page.evaluate((id) => {
                const project = (globalThis as any).generalStore.project;
                return (globalThis as any).diagramService.getDiagram(project, id)?.source;
            }, diagramId);
        const diagramDepth = () =>
            page.evaluate(() => {
                const items = (globalThis as any).generalStore.currentPage.items;
                for (const item of items) if (item.componentType === "diagram") return "top-level";
                return "moved";
            });

        await page.keyboard.press("Tab");
        await expect.poll(readSource).toBe("\tab");
        expect(await diagramDepth()).toBe("top-level");

        await page.keyboard.press("Shift+ArrowRight");
        await page.keyboard.press("Control+b");
        await page.waitForTimeout(300);
        expect(await readSource()).toBe("\tab");
    });
});
