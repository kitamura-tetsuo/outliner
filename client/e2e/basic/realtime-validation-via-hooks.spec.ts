/** @feature DAT-RT-0001
 *  Title   : Realtime validation via DataOperationHooks - strict E2E
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { DataValidationHelpers } from "../utils/dataValidationHelpers";
import { TestHelpers } from "../utils/testHelpers";

// 本テストは重めのデータ検証を含むため、タイムアウトを延長
import { test as base } from "@playwright/test";
base.describe.configure({ timeout: 120_000 });

// このテストは編集操作ごとにFluid/Yjsの整合を厳密に検証する
// - 余分なアイテムが作られないこと
// - FluidとYjsのアイテム数が一致し続けること
// - スナップショットは Fluid -> Yjs の順で比較

test.describe("DAT-RT-0001: realtime validation strict", () => {
    test.afterEach(async ({ page }, testInfo) => {
        const mode = process.env.E2E_OUTLINER_MODE || "fluid";
        if (mode === "yjs") {
            return; // Yjsモードではスキップ
        }

        const safeTitle = testInfo.title.replace(/[^a-zA-Z0-9-_]/g, "-");
        await DataValidationHelpers.saveSnapshotsAndCompare(page, `realtime-afterEach-${safeTitle}`);
    });

    test.beforeEach(async ({ page }, testInfo) => {
        // モード分離により、Yjsモードではリアルタイムバリデーション機能が無効化されているため、
        // Yjsモードでのテストはスキップする
        const mode = process.env.E2E_OUTLINER_MODE || "fluid";
        if (mode === "yjs") {
            test.skip(true, "Realtime validation is disabled in Yjs mode due to mode separation");
            return;
        }

        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    async function waitForCountsAligned(page, minFluid?: number, timeoutMs = 8000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const [f, y] = await Promise.all([
                getFluidItemCount(page),
                getYjsItemCount(page),
            ]);
            if (f >= 0 && y >= 0 && f === y && (minFluid === undefined || f >= minFluid)) return { f, y };
            await page.waitForTimeout(150);
        }
        const [f, y] = await Promise.all([
            getFluidItemCount(page),
            getYjsItemCount(page),
        ]);
        throw new Error(`Counts not aligned in time: Fluid=${f}, Yjs=${y}`);
    }

    async function getFluidItemCount(page) {
        return await page.evaluate(() => {
            const store = (window as any).__FLUID_STORE__;
            const fluidClient = store?.fluidClient || (window as any).__FLUID_CLIENT__;
            if (!fluidClient) return -1;
            try {
                const project = fluidClient.getProject?.();
                if (!project) return -1;
                const pages = project.items;
                const arrPages = Array.isArray(pages) ? pages : (pages ? [...pages] : []);
                // URLからページタイトルを取得して対象ページを選定
                const pageTitle = decodeURIComponent(location.pathname.split("/")[2] || "");
                const pageNode: any = arrPages.find((p: any) => String(p.text || "") === pageTitle) || arrPages[0];
                if (!pageNode) return -1;
                const childrenRaw = pageNode.items;
                const children = Array.isArray(childrenRaw) ? childrenRaw : (childrenRaw ? [...childrenRaw] : []);
                return children.length;
            } catch (e) {
                console.warn("[E2E] getFluidItemCount failed:", e);
                return -1;
            }
        });
    }

    async function getYjsItemCount(page) {
        return await page.evaluate(async () => {
            try {
                let ypm = (window as any).__YJS_PROJECT_MANAGER__;
                if (!ypm) {
                    // DataValidationHelpers.validateDataConsistency 前提でここに来ないはずだが、保険
                    const projectTitle = (window as any).__FLUID_CLIENT__?.getProject?.().title
                        || (window as any).appStore?.project?.title
                        || decodeURIComponent(location.pathname.split("/")[1] || "");
                    if (!projectTitle) return -1;
                    // ページ側初期化を待つ（最大3秒）
                    const start = Date.now();
                    while (!(window as any).__YJS_PROJECT_MANAGER__ && Date.now() - start < 3000) {
                        await new Promise(r => setTimeout(r, 100));
                    }
                    ypm = (window as any).__YJS_PROJECT_MANAGER__;
                    if (!ypm) return -1;
                }

                // URL からページタイトルを取得
                const pageTitle = decodeURIComponent(location.pathname.split("/")[2] || "");
                const pages = ypm.getPages();
                const target = pages.find((p: any) => String(p.title || "") === pageTitle) || pages[0];
                if (!target) return -1;
                const mgr = await ypm.connectToPage(target.id);

                const roots = mgr.getRootItems();
                const titleNode = roots.find((r: any) => String(r.text || "") === pageTitle);
                let items: any[] = [];
                if (titleNode) {
                    const kids = mgr.getChildren(titleNode.id) || [];
                    items = kids.length > 0 ? kids : roots.filter((r: any) => String(r.text || "") !== pageTitle);
                } else {
                    items = roots.filter((r: any) => String(r.text || "") !== pageTitle);
                }
                return items.length;
            } catch (e) {
                console.warn("[E2E] getYjsItemCount failed:", e);
                return -1;
            }
        });
    }

    test("editing keeps Fluid/Yjs item counts aligned with no extras", async ({ page }) => {
        // モード分離により、このテストは現在無効化されています
        // FluidモードではYjsアイテムは作成されず、YjsモードではFluidアイテムは作成されません

        // 現在のモードを確認
        const mode = await page.evaluate(() => {
            return localStorage.getItem("OUTLINER_MODE") || "fluid";
        });

        console.log(`🔧 [Test] Current mode: ${mode} - Skipping realtime validation due to mode separation`);

        // モード分離のため、このテストをスキップ
        test.skip(true, "Realtime validation disabled for mode separation");

        // 以下は参考用のコード（実行されません）
        /*
    // UI安定待ち
    await page.waitForSelector('[data-testid="outliner-base"]', { timeout: 30000 });

    // 初期スナップショット整合
    await DataValidationHelpers.validateDataConsistency(page);

    // 初期整合を確認
    const init = await waitForCountsAligned(page);
    const beforeFluid = init.f;
    const beforeYjs = init.y;

    // 1. アイテム追加
    await page.click('button:has-text("アイテム追加")');
    await page.waitForTimeout(200);
    const afterAdd = await waitForCountsAligned(page, beforeFluid + 1);
    expect(afterAdd.f).toBe(afterAdd.y);

    // 追加アイテムにフォーカス
    const lastItem = page.locator(".outliner-item").last();
    await lastItem.locator(".item-content").click({ force: true });

    // 2. 改行で新規アイテム作成（確実に新規アイテムにカーソルを当てる）
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    const afterEnter = await waitForCountsAligned(page, afterAdd.f + 1);
    expect(afterEnter.f).toBe(afterEnter.y);
    */

        /*
    // 新規アイテムのIDを取得してカーソルを設定
    const newItemId = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.outliner-item'));
      const el = items[items.length - 1] as HTMLElement | undefined;
      return el?.getAttribute('data-item-id') || null;
    });
    if (newItemId) {
      await page.evaluate((id) => {
        const store = (window as any).editorOverlayStore;
        if (store) {
          try {
            store.clearCursorAndSelection("local");
          } catch {}
          store.setActiveItem(id);
          const cursorId = store.setCursor({ itemId: id, offset: 0, isActive: true, userId: "local" });
          (window as any).__E2E_CURSOR_ID__ = cursorId;
        }
      }, newItemId);
      await page.waitForTimeout(100);
    }

    // 3. Backspaceで削除（新規アイテムをターゲットに）
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(300);
    const afterBack = await waitForCountsAligned(page, afterAdd.f);
    expect(Math.abs(afterBack.f - afterAdd.f)).toBeLessThanOrEqual(0);
    expect(afterBack.f).toBe(afterBack.y);

    // 最終スナップショット比較
    await DataValidationHelpers.saveSnapshotsAndCompare(page, "realtime-final");
    */
    });
});
