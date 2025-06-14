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
        const result = await page.evaluate(async () => {
            const db = window.__DB_SERVICE__;
            await db.init();
            const id = "p1";
            await db.addPage({ id, title: "First", content: "Hello" });
            const added = await db.getPage(id);
            await db.updatePage({ id, title: "Updated", content: "World" });
            const updated = await db.getPage(id);
            await db.deletePage(id);
            const remaining = await db.getAllPages();
            return { added, updated, remainingCount: remaining.length };
        });

        expect(result.added.title).toBe("First");
        expect(result.updated.title).toBe("Updated");
        expect(result.remainingCount).toBe(0);
    });
});
