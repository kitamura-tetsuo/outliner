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
        // pageId は後でスケジュールページのデバッグ要素から取得する（接続後のIDに合わせるため）
        pageId = "";
    });

    test("download contains upcoming schedule metadata", async ({ page }, testInfo) => {
        const idToken = await page.evaluate(async () => {
            const userManager = (window as any).__USER_MANAGER__;
            return await userManager?.auth?.currentUser?.getIdToken();
        });
        expect.soft(idToken).toBeTruthy();

        const nextRunAt = Date.now() + 10 * 60 * 1000;

        // まずスケジュールページへ遷移して、実際に使用される pageId を取得する
        const scheduleUrl = `http://localhost:7090/${encodeURIComponent(projectName)}/${
            encodeURIComponent(pageName)
        }/schedule`;
        await page.goto(scheduleUrl, { waitUntil: "domcontentloaded" });

        const debugEl = page.getByTestId("schedule-debug");
        await expect(debugEl).toBeVisible();
        const debugText = await debugEl.innerText();
        console.log(`[E2E] schedule-debug: ${debugText}`);
        const matched = /ScheduleDebug:([^:]+):/.exec(debugText);
        const resolvedPageId = matched?.[1] ?? "";
        expect(resolvedPageId).not.toEqual("");
        pageId = resolvedPageId;

        // 取得した pageId でスケジュールを作成
        const resp = await page.request.post("http://localhost:57000/api/create-schedule", {
            data: {
                idToken,
                pageId: resolvedPageId,
                schedule: { strategy: "one_shot", nextRunAt },
            },
        });
        const status = resp.status();
        const bodyText = await resp.text();
        console.log(`[E2E] create-schedule status=${status} body=${bodyText}`);
        expect(status, `create-schedule failed: ${bodyText}`).toBe(200);

        // 作成後にページをリロードして一覧を再取得
        await page.reload({ waitUntil: "domcontentloaded" });

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
