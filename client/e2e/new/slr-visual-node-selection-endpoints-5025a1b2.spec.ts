import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-5025a1b2
 *  Title   : Selections can start or end at a visual node
 *  Source  : docs/client-features/slr-visual-node-selection-endpoints-5025a1b2.yaml
 */
import { expect, test } from "@playwright/test";
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
});
