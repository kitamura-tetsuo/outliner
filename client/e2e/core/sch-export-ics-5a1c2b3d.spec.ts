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
        test.setTimeout(90000); // Increase timeout for CI environment
        // Attach browser console logs for debugging
        page.on("console", (msg) => {
            const type = msg.type();
            const txt = msg.text();
            if (txt.includes("Schedule page:")) {
                console.log(`[BROWSER-${type}] ${txt}`);
            }
            // Also log session storage operations
            if (txt.includes("Saved pageId") || txt.includes("Found session") || txt.includes("sessionPageId")) {
                console.log(`[BROWSER-${type}] ${txt}`);
            }
        });
        page.on("pageerror", (err) => {
            console.log("[BROWSER-PAGEERROR]", err?.message || String(err));
        });

        const env = await TestHelpers.prepareTestEnvironment(page, testInfo);
        projectName = env.projectName;
        pageName = env.pageName;
        // pageId は後でスケジュールページのデバッグ要素から取得する（接続後のIDに合わせるため）
        pageId = "";

        // Log session storage for debugging
        const sessionKey = `schedule:lastPageChildId:${encodeURIComponent(projectName)}:${
            encodeURIComponent(pageName)
        }`;
        console.log(`[E2E] Initial session storage key: ${sessionKey}`);
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

        // E2E stability: Wait for pageId to be resolved (might need navigation to main page first)
        let resolvedPageId = "";
        for (let waitAttempts = 0; waitAttempts < 100; waitAttempts++) {
            const debugText = await debugEl.innerText();
            console.log(`[E2E] schedule-debug: ${debugText}`);
            const matched = /ScheduleDebug:([^:]+):/.exec(debugText);
            resolvedPageId = matched?.[1] ?? "";
            if (resolvedPageId) {
                console.log(`[E2E] pageId resolved after ${waitAttempts * 100}ms: ${resolvedPageId}`);
                break;
            }
            await new Promise(r => setTimeout(r, 100));
        }
        expect(resolvedPageId).not.toEqual("");
        pageId = resolvedPageId;

        // NOTE: We don't reload here because page reload causes the page to be recreated
        // with a new pageId, which would invalidate the schedule we just created.
        // The pageId is already stable after the navigation flow in onMount.

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

        // スケジュール作成後にページを更新して新しいスケジュールを取得
        console.log(`[E2E] Refreshing schedules after creating schedule...`);
        await page.evaluate(async (pid) => {
            if (typeof window !== "undefined" && (window as any).refreshSchedules) {
                await (window as any).refreshSchedules(pid);
            }
        }, resolvedPageId);

        // 作成したスケジュールを確認するためにページをリロードせず、ポーリングでスケジュールアイテム的出现を待つ
        // (リロードするとページが再作成され、新しいpageIdが割り当てられてしまう)
        console.log(`[E2E] Waiting for schedule to appear...`);
        let scheduleItems = await page.locator('[data-testid="schedule-item"]').all();
        let scheduleCount = scheduleItems.length;
        for (let i = 0; i < 50; i++) {
            scheduleItems = await page.locator('[data-testid="schedule-item"]').all();
            scheduleCount = scheduleItems.length;
            if (scheduleCount > 0) {
                console.log(`[E2E] Found ${scheduleCount} schedule items after ${i * 100}ms`);
                break;
            }
            await new Promise(r => setTimeout(r, 100));
        }
        console.log(`[E2E] Found ${scheduleCount} schedule items`);
        expect(scheduleCount).toBeGreaterThan(0);

        const scheduleItem = scheduleItems[0];
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
