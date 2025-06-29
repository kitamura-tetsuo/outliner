import { test, expect } from "@playwright/test";

test.describe("Outliner Basic Test (No Auth)", () => {
    test("can access outliner interface elements", async ({ page }) => {
        console.log("Debug: Testing outliner interface without authentication");
        
        await page.goto("/", { 
            timeout: 60000,
            waitUntil: "domcontentloaded"
        });
        
        // ページが読み込まれるまで待機
        await page.waitForTimeout(3000);
        
        console.log("Debug: Page loaded, checking for outliner elements");
        
        // アウトライナーの基本要素を確認
        const body = page.locator('body');
        await expect(body).toBeVisible();
        
        // ページの内容を確認
        const pageContent = await page.content();
        console.log("Debug: Page contains outliner elements:", pageContent.includes('outliner'));
        
        // 基本的なDOM構造を確認
        const mainElement = page.locator('main, #app, [data-testid="app"]').first();
        if (await mainElement.count() > 0) {
            await expect(mainElement).toBeVisible();
            console.log("Debug: Main application element found");
        } else {
            console.log("Debug: No main application element found, checking body");
        }
        
        // JavaScriptエラーがないか確認
        const errors: string[] = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            }
        });
        
        // 少し待機してエラーを収集
        await page.waitForTimeout(2000);
        
        if (errors.length > 0) {
            console.log("Debug: JavaScript errors found:", errors);
        } else {
            console.log("Debug: No JavaScript errors detected");
        }
    });

    test("can check for UserManager availability", async ({ page }) => {
        console.log("Debug: Testing UserManager availability");
        
        await page.goto("/", { 
            timeout: 60000,
            waitUntil: "domcontentloaded"
        });
        
        // ページが読み込まれるまで待機
        await page.waitForTimeout(5000);
        
        // UserManagerの存在を確認
        const userManagerExists = await page.evaluate(() => {
            return {
                userManagerExists: typeof (window as any).__USER_MANAGER__ !== 'undefined',
                userManagerType: typeof (window as any).__USER_MANAGER__,
                windowKeys: Object.keys(window).filter(key => key.startsWith('__')),
                globalThis: typeof globalThis !== 'undefined'
            };
        });
        
        console.log("Debug: UserManager check result:", userManagerExists);
        
        // グローバル変数の状態を確認
        const globalVars = await page.evaluate(() => {
            const win = window as any;
            return {
                userManager: typeof win.__USER_MANAGER__,
                fluidStore: typeof win.__FLUID_STORE__,
                svelteGoto: typeof win.__SVELTE_GOTO__,
                allGlobals: Object.keys(win).filter(key => key.startsWith('__'))
            };
        });
        
        console.log("Debug: Global variables state:", globalVars);
    });

    test("can wait for application initialization", async ({ page }) => {
        console.log("Debug: Testing application initialization");
        
        await page.goto("/", { 
            timeout: 60000,
            waitUntil: "domcontentloaded"
        });
        
        // アプリケーションの初期化を待機（最大30秒）
        try {
            await page.waitForFunction(
                () => {
                    const win = window as any;
                    const hasUserManager = typeof win.__USER_MANAGER__ !== 'undefined';
                    console.log("Checking initialization - UserManager:", hasUserManager);
                    return hasUserManager;
                },
                { timeout: 30000 }
            );
            console.log("Debug: Application initialized successfully");
        } catch (error) {
            console.log("Debug: Application initialization timeout:", error);
            
            // タイムアウト時の状態を確認
            const state = await page.evaluate(() => {
                const win = window as any;
                return {
                    userManager: typeof win.__USER_MANAGER__,
                    readyState: document.readyState,
                    location: window.location.href,
                    errors: win.__INIT_ERRORS__ || []
                };
            });
            console.log("Debug: Application state at timeout:", state);
        }
    });
});
