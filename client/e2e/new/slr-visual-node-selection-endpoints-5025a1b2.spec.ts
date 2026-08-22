import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-5025a1b2
 *  Title   : Selections can start or end at a visual node
 *  Source  : docs/client-features/slr-visual-node-selection-endpoints-5025a1b2.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import {
    afterNode,
    atOffset,
    beforeNode,
    expectNodeFragmentCoversBlock,
    fragmentsForItem,
    seedVisualNodesAfterFirstItem,
    selectBetweenEndpoints,
    selectedPlainText,
} from "../utils/visualNodeSelectionHelpers";
import { itemIdByText, seedSelectionPage } from "../utils/visualNodeSelectionSeed";

async function deleteWithActiveCursor(page: Page, fallbackItemId: string): Promise<void> {
    await page.evaluate((itemId) => {
        const store = (globalThis as unknown as {
            editorOverlayStore: {
                setCursor: (cursor: { itemId: string; offset: number; isActive: boolean; userId: string; }) => string;
                getLocalCursorInstances: () => Array<{
                    isActive: boolean;
                    onKeyDown: (event: KeyboardEvent) => void;
                }>;
            };
        }).editorOverlayStore;
        if (!store.getLocalCursorInstances().some(instance => instance.isActive)) {
            store.setCursor({ itemId, offset: 0, isActive: true, userId: "local" });
        }
        const cursor = store.getLocalCursorInstances().find(instance => instance.isActive);
        if (!cursor) throw new Error("Active local cursor not found");
        cursor.onKeyDown(new KeyboardEvent("keydown", { key: "Delete" }));
    }, fallbackItemId);
}

test.describe("SLR-5025a1b2: node boundaries are selection endpoints", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await seedSelectionPage(page, testInfo);
    });

    test("a Grid between its own boundaries is selected, and nothing else is", async ({ page }) => {
        const alphaId = await itemIdByText(page, "Alpha text");
        const omegaId = await itemIdByText(page, "Omega text");
        const [gridId] = await seedVisualNodesAfterFirstItem(page, [{ type: "yjstable" }]);

        await selectBetweenEndpoints(page, beforeNode(gridId), afterNode(gridId));

        await expectNodeFragmentCoversBlock(page, gridId);
        expect(await fragmentsForItem(page, alphaId)).toHaveLength(0);
        expect(await fragmentsForItem(page, omegaId)).toHaveLength(0);

        // A textless block contributes no plain text - no invented label, no blank line.
        expect(await selectedPlainText(page)).toBe("");
    });

    test("a range ending before the Grid stops at it, one ending after includes it", async ({ page }) => {
        const alphaId = await itemIdByText(page, "Alpha text");
        const [gridId] = await seedVisualNodesAfterFirstItem(page, [{ type: "yjstable" }]);

        await selectBetweenEndpoints(page, atOffset(alphaId, 6), beforeNode(gridId));
        expect(await fragmentsForItem(page, gridId)).toHaveLength(0);
        expect(await selectedPlainText(page)).toBe("text");

        await selectBetweenEndpoints(page, atOffset(alphaId, 6), afterNode(gridId));
        await expectNodeFragmentCoversBlock(page, gridId);
        // The Text endpoint keeps its character geometry alongside the node fragment.
        const alphaFragments = await fragmentsForItem(page, alphaId);
        expect(alphaFragments.length).toBeGreaterThan(0);
        expect(alphaFragments.every(fragment => fragment.kind === "text")).toBe(true);
    });

    test("a range starting after the Grid leaves it out, one starting before takes it", async ({ page }) => {
        const omegaId = await itemIdByText(page, "Omega text");
        const [gridId] = await seedVisualNodesAfterFirstItem(page, [{ type: "yjstable" }]);

        await selectBetweenEndpoints(page, afterNode(gridId), atOffset(omegaId, 5));
        expect(await fragmentsForItem(page, gridId)).toHaveLength(0);
        expect(await selectedPlainText(page)).toBe("Omega");

        await selectBetweenEndpoints(page, beforeNode(gridId), atOffset(omegaId, 5));
        await expectNodeFragmentCoversBlock(page, gridId);
    });

    test("a reversed mixed range selects exactly what the forward one does", async ({ page }) => {
        const alphaId = await itemIdByText(page, "Alpha text");
        const [gridId] = await seedVisualNodesAfterFirstItem(page, [{ type: "yjstable" }]);

        await selectBetweenEndpoints(page, atOffset(alphaId, 6), afterNode(gridId));
        const forward = await fragmentsForItem(page, alphaId);
        const forwardText = await selectedPlainText(page);

        await selectBetweenEndpoints(page, afterNode(gridId), atOffset(alphaId, 6));
        await expectNodeFragmentCoversBlock(page, gridId);
        expect(await selectedPlainText(page)).toBe(forwardText);
        expect((await fragmentsForItem(page, alphaId)).map(fragment => fragment.kind))
            .toEqual(forward.map(fragment => fragment.kind));
    });

    test("Delete removes a lone Grid selected between its own boundaries", async ({ page }) => {
        const alphaId = await itemIdByText(page, "Alpha text");
        const [gridId] = await seedVisualNodesAfterFirstItem(page, [{ type: "yjstable" }]);

        await selectBetweenEndpoints(page, beforeNode(gridId), afterNode(gridId));
        await deleteWithActiveCursor(page, alphaId);

        await expect(page.locator(`[data-visual-node-root="${gridId}"]`)).toHaveCount(0);
    });

    test("Delete preserves a Grid excluded by either mixed-selection boundary", async ({ page }) => {
        const alphaId = await itemIdByText(page, "Alpha text");
        const omegaId = await itemIdByText(page, "Omega text");
        const [gridId] = await seedVisualNodesAfterFirstItem(page, [{ type: "yjstable" }]);
        const grid = page.locator(`[data-visual-node-root="${gridId}"]`);

        await selectBetweenEndpoints(page, atOffset(alphaId, 6), beforeNode(gridId));
        await deleteWithActiveCursor(page, alphaId);
        await expect(grid).toBeVisible();

        await selectBetweenEndpoints(page, afterNode(gridId), atOffset(omegaId, 5));
        await deleteWithActiveCursor(page, omegaId);
        await expect(grid).toBeVisible();
    });
});
