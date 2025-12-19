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

    // FIXME: Schedule list doesn't populate after reload despite create-schedule API returning 200.
    // This is an application-side issue with Yjs sync or schedule list reactive updates.
    test("download contains upcoming schedule metadata", async ({ page }, testInfo) => {
        const nextRunAt = Date.now() + 10 * 60 * 1000;

        // まずスケジュールページへ遷移して、実際に使用される pageId を取得する
        const scheduleUrl = `http://localhost:7090/${encodeURIComponent(projectName)}/${
            encodeURIComponent(pageName)
        }/schedule`;
        await page.goto(scheduleUrl, { waitUntil: "domcontentloaded" });

        const debugEl = page.getByTestId("schedule-debug");
        await expect(debugEl).toBeVisible({ timeout: 15000 });

        // Wait for pageId resolution in the debug element using poll
        await expect.poll(async () => {
            const text = await debugEl.innerText();
            console.log(`[E2E] schedule-debug text check: "${text}"`);
            const matched = /ScheduleDebug:([^:]+):/.exec(text);
            return matched?.[1] ?? "";
        }, {
            message: "Wait for pageId resolution in debug element",
            timeout: 20000,
        }).not.toBe("");

        // Since poll returns the assertion builder, we re-extract it for use
        const debugTextAfterWait = await debugEl.innerText();
        const finalMatch = /ScheduleDebug:([^:]+):/.exec(debugTextAfterWait);
        const finalPageId = finalMatch?.[1] ?? "";

        console.log(`[E2E] Resolved finalPageId: "${finalPageId}"`);
        pageId = finalPageId;

        // Create schedule using browser context to ensure correct auth/headers
        const createResult = await page.evaluate(async ({ pageId, nextRunAt }) => {
            console.log(`[E2E-Browser] Attempting create-schedule for pageId=${pageId}`);
            const userManager = (window as any).__USER_MANAGER__;
            const idToken = await userManager?.auth?.currentUser?.getIdToken();
            if (!idToken) throw new Error("No idToken in browser context");

            const resp = await fetch("/api/create-schedule", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    idToken,
                    pageId,
                    schedule: { strategy: "one_shot", nextRunAt },
                }),
            });
            const status = resp.status;
            const body = await resp.json();
            return { status, body };
        }, { pageId: finalPageId, nextRunAt });

        console.log(
            `[E2E] create-schedule browser-status=${createResult.status} body=${JSON.stringify(createResult.body)}`,
        );
        expect(createResult.status, `create-schedule failed: ${JSON.stringify(createResult.body)}`).toBe(200);

        // 作成後にページをリロードして一覧を再取得
        await page.reload({ waitUntil: "domcontentloaded" });

        // Wait for schedule list to be populated (the $effect in +page.svelte should trigger this)
        await expect.poll(async () => {
            const count = await page.locator('[data-testid="schedule-item"]').count();
            console.log(`[E2E] schedule-item count: ${count}`);
            return count;
        }, {
            message: "Wait for schedule item to appear after reload",
            timeout: 20000,
        }).toBeGreaterThan(0);

        const scheduleItem = page.locator('[data-testid="schedule-item"]').first();
        await expect(scheduleItem).toBeVisible({ timeout: 10000 });

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
