import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature DIA-c60db19e
 *  Title   : Durable Mermaid Diagram objects and page transclusions
 *  Source  : docs/client-features/dia-mermaid-diagram-objects-and-transclusions-c60db19e.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("DIA-c60db19e: Diagram identity, source and placement survive reload", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [""]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
    });

    test("keeps Diagram id, full source and tree position after a reload", async ({ page }) => {
        const target = page.locator(".outliner-item").nth(1);
        await target.locator(".item-content").click({ force: true });
        await page.waitForTimeout(300);
        await page.keyboard.press("End");
        await page.keyboard.type("/");
        await page.locator('[data-testid="command-item-diagram"]').click();
        await expect(page.locator('[data-testid="diagram-block"]')).toBeVisible({ timeout: 15000 });
        const diagramId = await page.locator('[data-testid="diagram-block"]').getAttribute("data-diagram-id");

        // Populate source through the real Diagram domain write path (issue
        // #5310's own test guidance — the native source editor is a later stage).
        await page.evaluate((id) => {
            const project = (globalThis as any).generalStore.project;
            (globalThis as any).diagramService.setDiagramSource(project, id, "graph TD; A-->B-->C");
        }, diagramId);
        await expect(page.locator('[data-testid="diagram-block-excerpt"]')).toHaveText("graph TD; A-->B-->C", {
            timeout: 10000,
        });

        await page.waitForTimeout(1000); // let the debounced persistence flush
        await page.reload();
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 15000 });

        await expect(page.locator('[data-testid="diagram-block"][data-diagram-state="ready"]')).toBeVisible({
            timeout: 15000,
        });
        await expect(page.locator('[data-testid="diagram-block"]')).toHaveAttribute("data-diagram-id", diagramId!);
        await expect(page.locator('[data-testid="diagram-block-excerpt"]')).toHaveText("graph TD; A-->B-->C");

        const afterReload = await page.evaluate(() => {
            const project = (globalThis as any).generalStore.project;
            return { size: project.diagrams.size };
        });
        expect(afterReload.size).toBe(1);
    });

    test("keeps a Diagram and its exact source available for reinsertion after its only occurrence is removed", async ({ page }) => {
        const target = page.locator(".outliner-item").nth(1);
        await target.locator(".item-content").click({ force: true });
        await page.waitForTimeout(300);
        await page.keyboard.press("End");
        await page.keyboard.type("/");
        await page.locator('[data-testid="command-item-diagram"]').click();
        await expect(page.locator('[data-testid="diagram-block"]')).toBeVisible({ timeout: 15000 });
        const diagramId = await page.locator('[data-testid="diagram-block"]').getAttribute("data-diagram-id");
        await page.evaluate((id) => {
            (globalThis as any).diagramService.setDiagramSource(
                (globalThis as any).generalStore.project,
                id,
                "graph TD; X-->Y",
            );
        }, diagramId);

        // Remove the only occurrence (delete the outline row).
        await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            items.at(1).delete();
        });
        await expect(page.locator('[data-testid="diagram-block"]')).toHaveCount(0, { timeout: 10000 });

        const stillThere = await page.evaluate((id) => {
            const project = (globalThis as any).generalStore.project;
            return (globalThis as any).diagramService.getDiagram(project, id);
        }, diagramId);
        expect(stillThere).toEqual({ id: diagramId, format: "mermaid", source: "graph TD; X-->Y" });

        // Reinsert via the chooser: same id and source come back.
        const newTarget = page.locator(".outliner-item").nth(0);
        await newTarget.locator(".item-content").click({ force: true });
        await page.waitForTimeout(300);
        await page.keyboard.press("End");
        await page.keyboard.type("/");
        await page.locator('[data-testid="command-item-diagram-transclusion"]').click();
        const chooser = page.getByTestId("diagram-chooser");
        await expect(chooser).toBeVisible({ timeout: 10000 });
        await chooser.getByTestId("diagram-chooser-option").first().click();
        await chooser.getByTestId("diagram-chooser-confirm").click();

        await expect(page.locator('[data-testid="diagram-block"]')).toHaveAttribute("data-diagram-id", diagramId!, {
            timeout: 15000,
        });
        await expect(page.locator('[data-testid="diagram-block-excerpt"]')).toHaveText("graph TD; X-->Y");
    });
});
