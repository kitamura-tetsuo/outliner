import { expect, test } from "../fixtures/console-forward";
import { captureSnapshot, saveSnapshot } from "../utils/snapshotHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Yjs Snapshot Test", () => {
    test("Test Yjs snapshot capture", async ({ page }, testInfo) => {
        console.log("🔧 [Test] Starting Yjs snapshot test...");

        // TestHelpersを使用してテスト環境を準備（Yjsモード）
        console.log("🔧 [Test] Preparing test environment for Yjs mode...");

        // Yjsモードを設定
        process.env.E2E_OUTLINER_MODE = "yjs";

        const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "Yjs Test item 1",
            "Yjs Test item 2",
            "Yjs Test item 3",
        ]);

        console.log("🔧 [Test] Test environment prepared:", { projectName, pageName });

        // プロジェクトが読み込まれるまで少し待機
        await page.waitForTimeout(2000);

        // ブラウザのコンソールメッセージをキャプチャ
        page.on("console", msg => {
            if (msg.text().includes("[Snapshot]")) {
                console.log("Browser console:", msg.text());
            }
        });

        try {
            console.log("🔧 [Test] Attempting to capture Yjs snapshot...");
            const snapshot = await captureSnapshot(page);
            console.log("🔧 [Test] Snapshot captured:", snapshot);

            // スナップショットをファイルに保存
            const savedPath = saveSnapshot(snapshot, "test-yjs-snapshot-capture");
            console.log("🔧 [Test] Snapshot saved to:", savedPath);

            expect(snapshot).toBeDefined();
            expect(snapshot.mode).toBe("yjs");
            expect(snapshot.projectTitle).toBeDefined();
            expect(snapshot.pages).toBeDefined();
            expect(snapshot.pages.length).toBeGreaterThan(0);

            console.log("🔧 [Test] Yjs snapshot test completed successfully");
        } catch (error) {
            console.error("🔧 [Test] Yjs snapshot test failed:", error);
            throw error;
        } finally {
            // モードを元に戻す
            process.env.E2E_OUTLINER_MODE = "fluid";
        }
    });
});
