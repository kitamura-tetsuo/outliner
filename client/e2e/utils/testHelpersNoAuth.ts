import { expect, type Page } from "@playwright/test";

/**
 * 認証なしのテスト用ヘルパー関数群
 */
export class TestHelpersNoAuth {
    /**
     * 認証をスキップしてテスト環境を準備する
     * @param page Playwrightのページオブジェクト
     * @returns 基本的な環境情報
     */
    public static async prepareTestEnvironmentNoAuth(
        page: Page,
        _testInfo: any,
    ): Promise<{ success: boolean; message: string; }> {
        // Use the parameter to avoid lint errors about unused vars
        void _testInfo;
        console.log("TestHelper: Starting navigation to home page (No Auth)");
        console.log("TestHelper: Page URL before navigation:", page.url());

        try {
            // ホームページに移動
            console.log("TestHelper: Attempting to navigate to /");
            await page.goto("/", {
                timeout: 60000,
                waitUntil: "domcontentloaded",
            });
            console.log("TestHelper: Successfully navigated to home page");
            console.log("TestHelper: Page URL after navigation:", page.url());

            // ページが読み込まれるまで待機
            await page.waitForTimeout(3000);

            // UserManagerが初期化されるまで待機（オプション）
            try {
                await page.waitForFunction(
                    () => (window as any).__USER_MANAGER__ !== undefined,
                    { timeout: 10000 },
                );
                console.log("TestHelper: UserManager found");
            } catch (_error) {
                console.log("TestHelper: UserManager not found, continuing without auth");
                void _error;
            }

            return {
                success: true,
                message: "Environment prepared without authentication",
            };
        } catch (error) {
            console.error("TestHelper: Failed to prepare environment:", error);
            return {
                success: false,
                message: `Failed to prepare environment: ${error}`,
            };
        }
    }

    /**
     * 基本的なページ要素が存在することを確認
     */
    public static async verifyBasicElements(page: Page): Promise<boolean> {
        try {
            // ページの基本要素を確認
            const body = page.locator("body");
            await expect(body).toBeVisible();

            // ページタイトルを確認
            const title = await page.title();
            console.log("TestHelper: Page title:", title);

            return true;
        } catch (error) {
            console.error("TestHelper: Basic element verification failed:", error);
            return false;
        }
    }

    /**
     * アウトライナー要素を探す
     */
    public static async findOutlinerElements(page: Page): Promise<{
        found: boolean;
        elements: string[];
    }> {
        try {
            const elements: string[] = [];

            // 一般的なアウトライナー要素を探す
            const selectors = [
                ".outliner-item",
                ".item-content",
                '[data-testid="outliner"]',
                '[data-testid="item"]',
                ".outliner",
                ".item",
                "main",
                "#app",
            ];

            for (const selector of selectors) {
                const count = await page.locator(selector).count();
                if (count > 0) {
                    elements.push(`${selector}: ${count} elements`);
                }
            }

            console.log("TestHelper: Found outliner elements:", elements);

            return {
                found: elements.length > 0,
                elements,
            };
        } catch (error) {
            console.error("TestHelper: Error finding outliner elements:", error);
            return {
                found: false,
                elements: [],
            };
        }
    }

    /**
     * JavaScript エラーを監視
     */
    public static setupErrorMonitoring(page: Page): string[] {
        const errors: string[] = [];

        page.on("console", msg => {
            if (msg.type() === "error") {
                errors.push(msg.text());
                console.log("TestHelper: JavaScript error detected:", msg.text());
            }
        });

        page.on("pageerror", error => {
            errors.push(error.message);
            console.log("TestHelper: Page error detected:", error.message);
        });

        return errors;
    }

    /**
     * ネットワークリクエストを監視
     */
    public static setupNetworkMonitoring(page: Page): {
        requests: any[];
        responses: any[];
    } {
        const requests: any[] = [];
        const responses: any[] = [];

        page.on("request", request => {
            requests.push({
                url: request.url(),
                method: request.method(),
                timestamp: Date.now(),
            });
        });

        page.on("response", response => {
            responses.push({
                url: response.url(),
                status: response.status(),
                timestamp: Date.now(),
            });
        });

        return { requests, responses };
    }
}
