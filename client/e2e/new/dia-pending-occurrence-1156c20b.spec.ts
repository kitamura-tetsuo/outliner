import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature DIA-c60db19e
 *  Title   : Durable Mermaid Diagram objects and page transclusions
 *  Source  : docs/client-features/dia-mermaid-diagram-objects-and-transclusions-c60db19e.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

const PENDING_DIAGRAM_ID = "diagram-not-yet-synced";

/** Simulate a stored occurrence whose Diagram registry entry has not arrived yet. */
async function seedPendingOccurrence(page: import("@playwright/test").Page) {
    return page.evaluate((diagramId) => {
        const item = (globalThis as any).generalStore.currentPage.items.at(0);
        item.componentType = "diagram";
        item.yMap.set("diagramId", diagramId);
        return item.id as string;
    }, PENDING_DIAGRAM_ID);
}

test.describe("DIA-c60db19e: an unresolved Diagram reference stays pending, never an empty Diagram", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [""]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
    });

    test("renders pending, creates nothing, and resolves once the Diagram arrives", async ({ page }) => {
        const occurrenceId = await seedPendingOccurrence(page);

        const block = page.locator('[data-testid="diagram-block"]');
        await expect(block).toHaveAttribute("data-diagram-state", "pending", { timeout: 10000 });
        await expect(block).toHaveAttribute("data-diagram-id", PENDING_DIAGRAM_ID);

        // Waiting on it must never fabricate a Diagram in the registry.
        expect(await page.evaluate(() => (globalThis as any).generalStore.project.diagrams.size)).toBe(0);

        // Deliver the Diagram state (as if a peer's write finally synced in).
        await page.evaluate((diagramId) => {
            const project = (globalThis as any).generalStore.project;
            (globalThis as any).diagramService.createDiagram(project, { diagramId, initialSource: "graph TD; A-->B" });
        }, PENDING_DIAGRAM_ID);

        await expect(block).toHaveAttribute("data-diagram-state", "ready", { timeout: 10000 });
        await expect(block).toHaveAttribute("data-diagram-id", PENDING_DIAGRAM_ID);
        await expect(page.locator('[data-testid="diagram-block-excerpt"]')).toHaveText("graph TD; A-->B");

        // The original occurrence resolved in place — its own id never changed.
        const stillSameOccurrence = await page.evaluate(
            (id) => (globalThis as any).generalStore.currentPage.items.at(0).id === id,
            occurrenceId,
        );
        expect(stillSameOccurrence).toBe(true);
    });

    test("stays pending across an unmount/remount before the Diagram is delivered", async ({ page }) => {
        await seedPendingOccurrence(page);
        await expect(page.locator('[data-testid="diagram-block"]')).toHaveAttribute("data-diagram-state", "pending", {
            timeout: 10000,
        });

        await page.reload();
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-testid="diagram-block"]')).toHaveAttribute("data-diagram-state", "pending", {
            timeout: 10000,
        });
        expect(await page.evaluate(() => (globalThis as any).generalStore.project.diagrams.size)).toBe(0);

        await page.evaluate((diagramId) => {
            const project = (globalThis as any).generalStore.project;
            (globalThis as any).diagramService.createDiagram(project, { diagramId, initialSource: "graph TD; P-->Q" });
        }, PENDING_DIAGRAM_ID);
        await expect(page.locator('[data-testid="diagram-block"]')).toHaveAttribute("data-diagram-state", "ready", {
            timeout: 10000,
        });
    });
});
