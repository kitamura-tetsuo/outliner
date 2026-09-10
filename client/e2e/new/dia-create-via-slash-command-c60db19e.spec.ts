import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature DIA-c60db19e
 *  Title   : Durable Mermaid Diagram objects and page transclusions
 *  Source  : docs/client-features/dia-mermaid-diagram-objects-and-transclusions-c60db19e.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/** Open the slash-command palette from `item` and click the option identified by `testId`. */
async function runSlashCommand(
    page: import("@playwright/test").Page,
    item: import("@playwright/test").Locator,
    testId: string,
) {
    await item.locator(".item-text").click();
    await page.waitForTimeout(300);
    await page.keyboard.press("End");
    await page.keyboard.type("/");
    const option = page.locator(`[data-testid="${testId}"]`);
    await expect(option).toBeVisible({ timeout: 10000 });
    await option.click();
}

async function diagramBlockIds(page: import("@playwright/test").Page): Promise<string[]> {
    return page.locator('[data-testid="diagram-block"]').evaluateAll((elements) =>
        elements.map((el) => el.closest(".outliner-item")?.getAttribute("data-item-id") ?? "")
    );
}

test.describe("DIA-c60db19e: creating and reusing a Mermaid Diagram from the outline UI", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["", "Second page target"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
    });

    test("New Mermaid diagram creates one Diagram object and one occurrence", async ({ page }) => {
        const target = page.locator(".outliner-item").nth(1);
        await runSlashCommand(page, target, "command-item-diagram");

        await expect(page.locator('[data-testid="diagram-block"][data-diagram-state="ready"]')).toBeVisible({
            timeout: 15000,
        });
        const diagramId = await page.locator('[data-testid="diagram-block"]').getAttribute("data-diagram-id");
        expect(diagramId).toBeTruthy();

        // Exactly one Diagram exists in the project registry, with an empty source.
        const registry = await page.evaluate(() => {
            const project = (globalThis as any).generalStore.project;
            return [...project.diagrams.entries()].map(([id, m]: [string, any]) => ({
                id,
                source: m.get("source")?.toString() ?? "",
            }));
        });
        expect(registry).toEqual([{ id: diagramId, source: "" }]);

        // No hidden Alias relationship: the created node carries no aliasTargetId.
        const occurrenceId = await diagramBlockIds(page).then((ids) => ids[0]);
        const aliasTargetId = await page.evaluate((id) => {
            const project = (globalThis as any).generalStore.project;
            for (const item of project.items) {
                for (const child of item.items) {
                    if (child.id === id) return child.aliasTargetId ?? null;
                }
            }
            return "not-found";
        }, occurrenceId);
        expect(aliasTargetId).toBeNull();
    });

    test("Insert transclusion reuses the same Diagram and source, with no copy", async ({ page }) => {
        const firstTarget = page.locator(".outliner-item").nth(1);
        await runSlashCommand(page, firstTarget, "command-item-diagram");
        await expect(page.locator('[data-testid="diagram-block"]')).toHaveCount(1, { timeout: 15000 });
        const firstDiagramId = await page.locator('[data-testid="diagram-block"]').getAttribute("data-diagram-id");

        const secondTarget = page.locator(".outliner-item").nth(2);
        await runSlashCommand(page, secondTarget, "command-item-diagram-transclusion");

        const chooser = page.locator('[data-testid="diagram-chooser"]');
        await expect(chooser).toBeVisible({ timeout: 10000 });
        await chooser.locator('[data-testid="diagram-chooser-option"]').first().click();
        await chooser.locator('[data-testid="diagram-chooser-confirm"]').click();

        await expect(page.locator('[data-testid="diagram-block"]')).toHaveCount(2, { timeout: 15000 });
        const ids = await diagramBlockIds(page);
        expect(new Set(ids).size).toBe(2); // two distinct occurrence ids

        const diagramIds = await page.locator('[data-testid="diagram-block"]').evaluateAll((elements) =>
            elements.map((el) => el.getAttribute("data-diagram-id"))
        );
        expect(diagramIds[0]).toBe(firstDiagramId);
        expect(diagramIds[1]).toBe(firstDiagramId);

        const registrySize = await page.evaluate(() => (globalThis as any).generalStore.project.diagrams.size);
        expect(registrySize).toBe(1);
    });
});
