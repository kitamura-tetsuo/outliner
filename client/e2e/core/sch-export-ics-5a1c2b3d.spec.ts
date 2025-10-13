/** @feature SCH-5A1C2B3D
 *  Title   : Schedule iCal Export
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { promises as fs } from "fs";
import path from "path";
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("SCH-5A1C2B3D: Schedule iCal Export", () => {
    let projectName: string;
    let pageName: string;
    let pageId: string;

    test.beforeEach(async ({ page }, testInfo) => {
        const env = await TestHelpers.prepareTestEnvironment(page, testInfo);
        projectName = env.projectName;
        pageName = env.pageName;
        pageId = (await TestHelpers.getItemIdByIndex(page, 0)) ?? "";
        expect.soft(pageId).not.toEqual("");
    });

    test("download contains upcoming schedule metadata", async ({ page }, testInfo) => {
        const idToken = await page.evaluate(async () => {
            const userManager = (window as any).__USER_MANAGER__;
            return await userManager?.auth?.currentUser?.getIdToken();
        });
        expect.soft(idToken).toBeTruthy();

        const nextRunAt = Date.now() + 10 * 60 * 1000;

        await page.request.post("http://localhost:57000/api/create-schedule", {
            data: {
                idToken,
                pageId,
                schedule: { strategy: "one_shot", nextRunAt },
            },
        });

        const scheduleUrl = `http://localhost:7090/${encodeURIComponent(projectName)}/${
            encodeURIComponent(pageName)
        }/schedule`;
        await page.goto(scheduleUrl, { waitUntil: "domcontentloaded" });

        const scheduleItem = page.locator('[data-testid="schedule-item"]').first();
        await expect(scheduleItem).toBeVisible();

        const downloadPromise = page.waitForEvent("download");
        await page.getByTestId("download-ics").click();
        const download = await downloadPromise;

        const expectedFilename = `outliner-schedules-${pageId}.ics`;
        expect(download.suggestedFilename()).toBe(expectedFilename);

        const filePath = path.join(testInfo.outputDir, expectedFilename);
        await download.saveAs(filePath);

        const content = await fs.readFile(filePath, "utf-8");
        expect(content).toContain("BEGIN:VCALENDAR");
        expect(content).toContain("SUMMARY:Outliner publish (one_shot)");
        const dtstart = new Date(nextRunAt).toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
        expect(content).toContain(`DTSTART:${dtstart}`);
        expect(content).toContain("X-OUTLINER-STRATEGY:one_shot");
    });
});
