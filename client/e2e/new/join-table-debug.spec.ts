/** @feature DEBUG
 * join-table ページの初期化問題をデバッグ
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("DEBUG: join-table initialization", () => {
    test("investigate join-table page initialization", async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [], false, true);
        
        // コンソールログを監視
        const logs: string[] = [];
        page.on('console', msg => {
            logs.push(`${msg.type()}: ${msg.text()}`);
        });

        // エラーを監視
        const errors: string[] = [];
        page.on('pageerror', error => {
            errors.push(error.message);
        });

        await page.goto("/join-table", { waitUntil: "domcontentloaded" });

        // 5秒待機してページの状態を確認
        await page.waitForTimeout(5000);

        // ページの状態を調査
        const pageState = await page.evaluate(() => {
            return {
                hasWindow: typeof window !== 'undefined',
                hasJoinTable: !!(window as any).__JOIN_TABLE__,
                joinTableKeys: (window as any).__JOIN_TABLE__ ? Object.keys((window as any).__JOIN_TABLE__) : [],
                hasFluid: !!((window as any).__JOIN_TABLE__?.fluid),
                hasStore: !!((window as any).__JOIN_TABLE__?.store),
                hasSql: !!((window as any).__JOIN_TABLE__?.sql),
                documentReady: document.readyState,
                bodyContent: document.body.innerHTML.length,
                hasEditableGrid: !!document.querySelector('[data-testid="editable-grid"]'),
                errorMessages: (window as any).__ERROR_MESSAGES__ || [],
            };
        });

        console.log("Page state:", pageState);
        console.log("Console logs:", logs);
        console.log("Page errors:", errors);

        // 基本的な要素が存在することを確認
        expect(pageState.hasWindow).toBe(true);
        expect(pageState.documentReady).toBe('complete');
        expect(pageState.bodyContent).toBeGreaterThan(0);

        // エラーがある場合は詳細を出力
        if (errors.length > 0) {
            console.error("Page errors detected:", errors);
        }

        // JOIN_TABLEオブジェクトの状態を詳細に調査
        if (pageState.hasJoinTable) {
            console.log("JOIN_TABLE keys:", pageState.joinTableKeys);
            console.log("Has fluid:", pageState.hasFluid);
            console.log("Has store:", pageState.hasStore);
            console.log("Has sql:", pageState.hasSql);
        } else {
            console.log("JOIN_TABLE object not found");
        }
    });

    test("check service initialization individually", async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [], false, true);
        await page.goto("/join-table", { waitUntil: "domcontentloaded" });

        // 各サービスの初期化を個別にテスト
        const serviceStatus = await page.evaluate(async () => {
            const results: any = {};

            // SqlService のテスト
            try {
                const { SqlService } = await import('/src/services/sqlService.ts');
                const sql = new SqlService();
                await sql.init();
                await sql.exec("SELECT 1");
                results.sqlService = { success: true, error: null };
            } catch (error) {
                results.sqlService = { success: false, error: error.message };
            }

            // FluidTableClient のテスト
            try {
                const { FluidTableClient } = await import('/src/services/fluidClient.ts');
                const fluid = new FluidTableClient();
                await fluid.createContainer();
                results.fluidClient = { success: true, error: null };
            } catch (error) {
                results.fluidClient = { success: false, error: error.message };
            }

            return results;
        });

        console.log("Service initialization status:", serviceStatus);

        // 結果を確認
        if (!serviceStatus.sqlService.success) {
            console.error("SqlService initialization failed:", serviceStatus.sqlService.error);
        }

        if (!serviceStatus.fluidClient.success) {
            console.error("FluidTableClient initialization failed:", serviceStatus.fluidClient.error);
        }
    });
});
