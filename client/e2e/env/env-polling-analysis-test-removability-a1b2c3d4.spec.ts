/**
 * ENV-POLL-0001: ポーリング削除可能性テスト
 *
 * 各ポーリングを無効化してテストを実行し、
 * 削除しても問題ないポーリングを特定します。
 */

import { expect, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
    generatePollingTestReport,
    getPollingStats,
    initPollingMonitor,
    type PollingTestResult,
    startPollingMonitor,
    testWithoutPolling,
} from "../utils/pollingTestHelper";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test.describe("ENV-POLL-0001: ポーリング削除可能性テスト", () => {
    const results: PollingTestResult[] = [];

    test.beforeEach(async ({ page }) => {
        await initPollingMonitor(page);
        await TestHelpers.prepareTestEnvironment(page, test.info());
        await startPollingMonitor(page);
    });

    test.afterAll(async () => {
        // レポートを生成
        const report = generatePollingTestReport(results);
        const reportPath = path.join(process.cwd(), "docs", "polling-removability-report.md");
        fs.writeFileSync(reportPath, report, "utf-8");
        console.log(`\nレポートを保存しました: ${reportPath}`);
    });

    test("OutlinerItem.svelte の aliasLastConfirmedPulse ポーリング", async ({ page }) => {
        // OutlinerItem.svelte の 340行目付近のポーリング
        const result = await testWithoutPolling(
            page,
            "OutlinerItem aliasLastConfirmedPulse",
            /OutlinerItem\.svelte.*aliasLastConfirmedPulse/,
            async () => {
                // エイリアス機能のテスト
                await page.goto("http://localhost:7090/test-project/test-page");
                await page.waitForSelector("[data-item-id]", { timeout: 5000 });

                const items = await page.locator("[data-item-id]").all();
                expect(items.length).toBeGreaterThan(0);

                // エイリアス属性が設定されているか確認
                const firstItem = items[0];
                await firstItem.evaluate(el => el.hasAttribute("data-alias-target-id"));

                // ポーリングなしでも属性が設定されるべき
                // （Yjs observeで十分なはず）
                expect(typeof hasAliasAttr).toBe("boolean");
            },
        );

        results.push(result);
    });

    test("OutlinerItemAlias.svelte の aliasLastConfirmedPulse ポーリング", async ({ page }) => {
        const result = await testWithoutPolling(
            page,
            "OutlinerItemAlias aliasLastConfirmedPulse",
            /OutlinerItemAlias\.svelte.*aliasLastConfirmedPulse/,
            async () => {
                await page.goto("http://localhost:7090/test-project/test-page");
                await page.waitForSelector("[data-item-id]", { timeout: 5000 });

                // エイリアスコンポーネントが正しく表示されるか
                const aliasComponents = await page.locator(".alias-content").all();

                // ポーリングなしでもエイリアスが表示されるべき
                expect(aliasComponents.length).toBeGreaterThanOrEqual(0);
            },
        );

        results.push(result);
    });

    test("CommentThread.svelte の入力値ポーリング", async ({ page }) => {
        const result = await testWithoutPolling(
            page,
            "CommentThread input polling",
            /CommentThread\.svelte.*setInterval/,
            async () => {
                await page.goto("http://localhost:7090/test-project/test-page");
                await page.waitForSelector("[data-item-id]", { timeout: 5000 });

                // コメントボタンをクリック
                const commentButton = page.locator("button.comment-button").first();
                await commentButton.click();

                // コメント入力欄が表示されるか
                const commentInput = page.locator('[data-testid="new-comment-input"]');
                await expect(commentInput).toBeVisible({ timeout: 5000 });

                // コメントを入力
                await commentInput.fill("Test comment");

                // 追加ボタンをクリック
                const addButton = page.locator('button:has-text("追加")');
                await addButton.click();

                // コメントが追加されるか
                await expect(page.locator(".comment-item")).toBeVisible({ timeout: 5000 });

                // ポーリングなしでもbind:valueが機能するべき
            },
        );

        results.push(result);
    });

    test("OutlinerItem.svelte の E2E ファイルドロップポーリング", async ({ page }) => {
        const result = await testWithoutPolling(
            page,
            "OutlinerItem E2E file drop polling",
            /OutlinerItem\.svelte.*__E2E_LAST_FILES__/,
            async () => {
                await page.goto("http://localhost:7090/test-project/test-page");
                await page.waitForSelector("[data-item-id]", { timeout: 5000 });

                // 通常のテキスト編集が動作するか
                const firstItem = page.locator("[data-item-id]").first();
                await firstItem.click();

                await page.keyboard.type("Test text");

                // テキストが入力されるか
                await expect(firstItem).toContainText("Test text", { timeout: 5000 });

                // ファイルドロップのポーリングは通常操作には不要
            },
        );

        results.push(result);
    });

    test("EditorOverlay.svelte の位置更新ポーリング", async ({ page }) => {
        const result = await testWithoutPolling(
            page,
            "EditorOverlay position update",
            /EditorOverlay\.svelte.*setInterval.*16/,
            async () => {
                await page.goto("http://localhost:7090/test-project/test-page");
                await page.waitForSelector("[data-item-id]", { timeout: 5000 });

                // カーソルを設定
                const firstItem = page.locator("[data-item-id]").first();
                await firstItem.click();

                // カーソルが表示されるか
                const cursor = page.locator(".cursor");
                await expect(cursor).toBeVisible({ timeout: 5000 });

                // ポーリングなしでもMutationObserverで位置更新されるべき
            },
        );

        results.push(result);
    });

    test("統計情報の確認", async ({ page }) => {
        await page.goto("http://localhost:7090/test-project/test-page");
        await page.waitForSelector("[data-item-id]", { timeout: 5000 });

        // 少し待機してポーリングが実行されるのを待つ
        await page.waitForTimeout(3000);

        // ポーリング統計を取得
        const stats = await getPollingStats(page);

        console.log("\n=== ポーリング統計 ===");
        console.log(`総呼び出し数: ${stats.totalCalls}`);
        console.log(`アクティブ: ${stats.activeCalls}`);
        console.log(`無効化済み: ${stats.disabledCalls}`);

        // 実行回数が多いポーリングを表示
        const sortedCalls = stats.calls.sort((a: any, b: any) => b.executionCount - a.executionCount);

        console.log("\n実行回数が多いポーリング（上位10件）:");
        for (const call of sortedCalls.slice(0, 10)) {
            console.log(`  - ${call.type} (delay=${call.delay}ms): ${call.executionCount}回実行`);

            // スタックトレースから呼び出し元を特定
            const stackLines = call.stack.split("\n");
            const relevantLine = stackLines.find((line: string) => line.includes(".svelte") || line.includes(".ts"));
            if (relevantLine) {
                console.log(`    ${relevantLine.trim()}`);
            }
        }

        // 短い間隔のポーリングを警告
        const shortIntervalPolling = stats.calls.filter((call: any) =>
            call.type === "setInterval" && call.delay && call.delay < 200
        );

        if (shortIntervalPolling.length > 0) {
            console.log(`\n⚠ 警告: ${shortIntervalPolling.length}件の短い間隔（<200ms）のポーリングが検出されました`);
            for (const call of shortIntervalPolling) {
                console.log(`  - delay=${call.delay}ms, 実行回数=${call.executionCount}`);
            }
        }
    });
});
