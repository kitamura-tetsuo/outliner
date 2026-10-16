/** @feature FTR-5194c2f1 */
import { expect, test } from "@playwright/test";
import {
    pointGridAToTableB,
    seedOverlappingTableFixture,
    snapshotProject,
} from "../utils/gridMutationProvenanceHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test(
    "Replace Current follows Project SELECT provenance instead of an overlapping bare id",
    async ({ page }, testInfo) => {
        test.setTimeout(180000);
        const fixture = await seedOverlappingTableFixture(page, testInfo);
        await pointGridAToTableB(page, fixture);

        await page.getByTestId("search-toggle-button").click();
        await page.getByTestId("search-input").fill("Value from B");
        await page.getByTestId("search-button").click();
        // Both rendered Grids now project the same physical B record. The two
        // logical placements must remain discoverable even though either one
        // addresses the same guarded source cell.
        await expect(page.getByTestId("search-results-hits")).toHaveText("Hits: 2", { timeout: 30000 });
        await page.getByTestId("search-result-button").first().click();
        await page.getByTestId("replace-input").fill("Replaced in B");
        await page.getByTestId("replace-button").click();

        await expect.poll(async () => {
            const state = await snapshotProject(page);
            return {
                a: state.tables.find(table => table.id === fixture.tableA.id)?.data[fixture.recordId]?.title,
                b: state.tables.find(table => table.id === fixture.tableB.id)?.data[fixture.recordId]?.title,
            };
        }, { timeout: 30000 }).toEqual({ a: "Value from A", b: "Replaced in B" });
    },
);
