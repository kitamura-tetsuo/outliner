import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Late Page-Item Hydration", () => {
    test("page schedule ID is captured correctly without polling", async ({ page }, testInfo) => {
        // We will seed a project with one page
        const { projectName, pageName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Root Item"]);

        // Wait for session storage to be populated reactively
        await expect.poll(async () => {
            return await page.evaluate(({ pid, ppage }) => {
                const key = `schedule:lastPageChildId:${encodeURIComponent(pid)}:${encodeURIComponent(ppage)}`;
                return window.sessionStorage.getItem(key) !== null;
            }, { pid: projectName, ppage: pageName });
        }, { timeout: 10000 }).toBe(true);

        const savedId = await page.evaluate(({ pid, ppage }) => {
            const key = `schedule:lastPageChildId:${encodeURIComponent(pid)}:${encodeURIComponent(ppage)}`;
            return window.sessionStorage.getItem(key);
        }, { pid: projectName, ppage: pageName });

        expect(savedId).toBeTruthy();
    });
});
