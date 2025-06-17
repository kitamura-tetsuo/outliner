/** @feature DBW-001
 *  Title   : Client-Side SQL Database
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("DBW-001: Client-Side SQL Database", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("basic CRUD operations", async ({ page }) => {
        const result = await TestHelpers.runClientDbCrud(page);

        expect(result.added.title).toBe("First");
        expect(result.updated.title).toBe("Updated");
        expect(result.remainingCount).toBe(0);
    });
});
