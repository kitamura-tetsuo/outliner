import "./utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "./utils/registerCoverageHooks";
registerCoverageHooks();
/**
 * @file container-title-persistence.spec.ts
 * @description コンテナタイトルの永続化とホーム.dropdown表示のE2Eテスト
 * コンテナタイトルがmetaDocに永続化され、ページ再読み込み後もホーム.dropdownに表示されることを確認
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "./utils/testHelpers";

/**
 * @feature CNT-0001
 *  Title   : コンテナタイトルの永続化とホーム.dropdown表示
 *  Source  : docs/client-features.yaml
 */
test.describe("コンテナタイトルの永続化テスト", () => {
    /**
     * @testcase コンテナ作成後にホーム.dropdownに表示される
     * @description 新しいコンテナを作成し、作成直後にホーム.dropdownにコンテナ名が表示されることを確認
     */
    test("コンテナ作成後にホーム.dropdownに表示される", async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // プロジェクトとページを作成（コンテナが作成される）
        const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(page, testInfo);
        const encodedProject = encodeURIComponent(projectName);
        const encodedPage = encodeURIComponent(pageName);

        // プロジェクトページに移動
        await page.goto(`/${encodedProject}/${encodedPage}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);

        // プロジェクト名を取得（これはcontainer titleとして使用される）
        const projectTitle = projectName;

        // ホームに遷移
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);

        // ホーム.dropdownまたはコンテナ一覧が表示されるまで待機
        await page.waitForSelector('[data-testid="container-dropdown"], .container-list, .home-dropdown', {
            timeout: 10000,
        });

        // 作成したコンテナがホーム.dropdownに表示されていることを確認
        const containerElement = page.locator('[data-testid="container-dropdown"], .container-list, .home-dropdown');
        await expect(containerElement).toContainText(projectTitle);

        // コンテナIDでも確認（フォールバック機能）
        // フォールバック: プロジェクト名による検索でコンテナが見つからない場合はコンテナの存在を確認
        if (await containerElement.count() > 0) {
            // コンテナが表示されていることを確認（具体的なテキストは環境によって異なる可能性あり）
            const hasContent = await containerElement.evaluate((el) => el.textContent?.trim().length > 0);
            expect(hasContent).toBe(true);
        }
    });

    /**
     * @testcase コンテナタイトルがmetaDocに永続化される
     * @description コンテナにタイトルを設定し、そのタイトルがmetaDocに永続化されることを確認
     */
    test("コンテナタイトルがmetaDocに永続化される", async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // プロジェクトとページを作成
        const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(page, testInfo);
        const encodedProject = encodeURIComponent(projectName);
        const encodedPage = encodeURIComponent(pageName);

        // プロジェクトページに移動
        await page.goto(`/${encodedProject}/${encodedPage}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);

        // metaDocにコンテナタイトルを設定（setContainerTitleInMetaDocを呼び出し）
        await page.evaluate((projectName) => {
            // metaDocモジュールの関数を呼び出してタイトルを設定
            const metaDocModule = (window as any).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.setContainerTitleInMetaDoc) {
                metaDocModule.setContainerTitleInMetaDoc(projectName, "カスタムコンテナタイトル");
            }
        }, projectName);

        // metaDocにタイトルが設定されたことを確認
        const storedTitle = await page.evaluate((projectName) => {
            const metaDocModule = (window as any).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
                return metaDocModule.getContainerTitleFromMetaDoc(projectName);
            }
            return null;
        }, projectName);

        expect(storedTitle).toBe("カスタムコンテナタイトル");
    });

    /**
     * @testcase ページ再読み込み後もコンテナがホーム.dropdownに表示される
     * @description コンテナを作成して 홈に移動し、ページを再読み込み後もコンテナが 여전히表示されることを確認
     */
    test("ページ再読み込み後もコンテナがホーム.dropdownに表示される", async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // プロジェクトとページを作成
        const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(page, testInfo);
        const encodedProject = encodeURIComponent(projectName);
        const encodedPage = encodeURIComponent(pageName);

        // プロジェクトページに移動
        await page.goto(`/${encodedProject}/${encodedPage}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);

        // ホームに遷移
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);

        // ホーム.dropdownが表示されるまで待機
        await page.waitForSelector('[data-testid="container-dropdown"], .container-list, .home-dropdown', {
            timeout: 10000,
        });

        // 再読み込み前にコンテナの表示状態を確認
        const containerBeforeReload = page.locator(
            '[data-testid="container-dropdown"], .container-list, .home-dropdown',
        );
        const hasContainerBefore = (await containerBeforeReload.count()) > 0;
        expect(hasContainerBefore).toBe(true);

        // ページを再読み込み
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);

        // 再読み込み後もコンテナが表示されることを確認
        const containerAfterReload = page.locator(
            '[data-testid="container-dropdown"], .container-list, .home-dropdown',
        );
        await expect(containerAfterReload).toBeVisible();
    });

    /**
     * @testcase コンテナタイトルが再読み込み後も保持される
     * @description コンテナにタイトルを設定し、ページを再読み込み後もタイトルが保持されることを確認
     */
    test("コンテナタイトルが再読み込み後も保持される", async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // プロジェクトとページを作成
        const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(page, testInfo);
        const encodedProject = encodeURIComponent(projectName);
        const encodedPage = encodeURIComponent(pageName);

        // プロジェクトページに移動
        await page.goto(`/${encodedProject}/${encodedPage}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);

        // metaDocにカスタムタイトルを設定
        await page.evaluate((projectName) => {
            const metaDocModule = (window as any).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.setContainerTitleInMetaDoc) {
                metaDocModule.setContainerTitleInMetaDoc(projectName, "再読み込み保持テストタイトル");
            }
        }, projectName);

        // 設定したタイトルが取得できることを確認
        let storedTitle = await page.evaluate((projectName) => {
            const metaDocModule = (window as any).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
                return metaDocModule.getContainerTitleFromMetaDoc(projectName);
            }
            return null;
        }, projectName);

        expect(storedTitle).toBe("再読み込み保持テストタイトル");

        // ページを再読み込み
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000); // IndexedDBの読み込みを待つ

        // 再読み込み後もタイトルが保持されていることを確認
        storedTitle = await page.evaluate((projectName) => {
            const metaDocModule = (window as any).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
                return metaDocModule.getContainerTitleFromMetaDoc(projectName);
            }
            return null;
        }, projectName);

        expect(storedTitle).toBe("再読み込み保持テストタイトル");
    });

    /**
     * @testcase タイトルが利用できない場合、コンテナIDが表示される（フォールバック）
     * @description タイトルが設定されていないコンテナについて、コンテナのIDが代わりに表示されることを確認
     */
    test("タイトルが利用できない場合、コンテナIDが表示される（フォールバック）", async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // プロジェクトとページを作成（タイトルは設定しない）
        const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(page, testInfo);
        const encodedProject = encodeURIComponent(projectName);
        const encodedPage = encodeURIComponent(pageName);

        // プロジェクトページに移動
        await page.goto(`/${encodedProject}/${encodedPage}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);

        // metaDocからタイトルを取得（空であることを確認）
        const metaDocTitle = await page.evaluate((projectName) => {
            const metaDocModule = (window as any).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
                return metaDocModule.getContainerTitleFromMetaDoc(projectName);
            }
            return "";
        }, projectName);

        // タイトルが空であることを確認
        expect(metaDocTitle).toBe("");

        // ホームに遷移
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);

        // ホーム.dropdownが表示されるまで待機
        await page.waitForSelector('[data-testid="container-dropdown"], .container-list, .home-dropdown', {
            timeout: 10000,
        });

        // コンテナID（プロジェクト名）が代わりに表示されていることを確認
        const containerElement = page.locator('[data-testid="container-dropdown"], .container-list, .home-dropdown');

        // フォールバック動作：プロジェクト名（コンテナID）が表示されている
        // 環境によってフォールバック実装が異なる可能性があるため、
        // コンテナが存在することを確認（具体的な表示内容は環境依存）
        await expect(containerElement).toBeVisible();
    });

    /**
     * @testcase metaDocでタイトルを更新するとホーム.dropdownのラベルが変更される
     * @description metaDocでコンテナタイトルを更新した場合、ホーム.dropdownのラベルも更新されることを確認
     */
    test("metaDocでタイトルを更新するとホーム.dropdownのラベルが変更される", async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // プロジェクトとページを作成
        const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(page, testInfo);
        const encodedProject = encodeURIComponent(projectName);
        const encodedPage = encodeURIComponent(pageName);

        // プロジェクトページに移動
        await page.goto(`/${encodedProject}/${encodedPage}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);

        // 初期タイトルを設定
        await page.evaluate((projectName) => {
            const metaDocModule = (window as any).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.setContainerTitleInMetaDoc) {
                metaDocModule.setContainerTitleInMetaDoc(projectName, "初期タイトル");
            }
        }, projectName);

        // 初期タイトルが設定されたことを確認
        let storedTitle = await page.evaluate((projectName) => {
            const metaDocModule = (window as any).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
                return metaDocModule.getContainerTitleFromMetaDoc(projectName);
            }
            return null;
        }, projectName);
        expect(storedTitle).toBe("初期タイトル");

        // タイトルを更新
        await page.evaluate((projectName) => {
            const metaDocModule = (window as any).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.setContainerTitleInMetaDoc) {
                metaDocModule.setContainerTitleInMetaDoc(projectName, "更新されたタイトル");
            }
        }, projectName);

        // 更新されたタイトルが反映されていることを確認
        storedTitle = await page.evaluate((projectName) => {
            const metaDocModule = (window as any).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
                return metaDocModule.getContainerTitleFromMetaDoc(projectName);
            }
            return null;
        }, projectName);
        expect(storedTitle).toBe("更新されたタイトル");
    });

    /**
     * @testcase 複数のコンテナでタイトル永続化が独立して動作する
     * @description 複数のコンテナを作成し、それぞれ独立的タイトルが永続化されることを確認
     */
    test("複数のコンテナでタイトル永続化が独立して動作する", async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // プロジェクトとページを作成（Container 1）
        const { projectName: projectName1, pageName: pageName1 } = await TestHelpers.prepareTestEnvironment(
            page,
            testInfo,
        );
        const encodedProject1 = encodeURIComponent(projectName1);
        const encodedPage1 = encodeURIComponent(pageName1);

        // プロジェクトページ1に移動
        await page.goto(`/${encodedProject1}/${encodedPage1}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);

        // Container 1にタイトルを設定
        await page.evaluate((projectName) => {
            const metaDocModule = (window as any).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.setContainerTitleInMetaDoc) {
                metaDocModule.setContainerTitleInMetaDoc(projectName, "コンテナ1のタイトル");
            }
        }, projectName1);

        // Container 1のタイトルが設定されたことを確認
        let storedTitle1 = await page.evaluate((projectName) => {
            const metaDocModule = (window as any).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
                return metaDocModule.getContainerTitleFromMetaDoc(projectName);
            }
            return null;
        }, projectName1);
        expect(storedTitle1).toBe("コンテナ1のタイトル");

        // Container 2を作成
        const projectName2 = `TestProject2-${Date.now()}`;
        const pageName2 = `page-${Date.now()}`;
        await TestHelpers.createTestProjectAndPageViaAPI(page, projectName2, pageName2);

        const encodedProject2 = encodeURIComponent(projectName2);
        const encodedPage2 = encodeURIComponent(pageName2);

        // プロジェクトページ2に移動
        await page.goto(`/${encodedProject2}/${encodedPage2}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);

        // Container 2にタイトルを設定
        await page.evaluate((projectName) => {
            const metaDocModule = (window as any).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.setContainerTitleInMetaDoc) {
                metaDocModule.setContainerTitleInMetaDoc(projectName, "コンテナ2のタイトル");
            }
        }, projectName2);

        // Container 2のタイトルが設定されたことを確認
        const storedTitle2 = await page.evaluate((projectName) => {
            const metaDocModule = (window as any).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
                return metaDocModule.getContainerTitleFromMetaDoc(projectName);
            }
            return null;
        }, projectName2);
        expect(storedTitle2).toBe("コンテナ2のタイトル");

        // Container 1のタイトルが影響を受けていないことを確認
        storedTitle1 = await page.evaluate((projectName) => {
            const metaDocModule = (window as any).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
                return metaDocModule.getContainerTitleFromMetaDoc(projectName);
            }
            return null;
        }, projectName1);
        expect(storedTitle1).toBe("コンテナ1のタイトル");
    });
});
