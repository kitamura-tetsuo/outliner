/** @feature SEA-0001
 *  Title   : Add page title search box
 *  Source  : docs/client-features.yaml
 */
import fs from "node:fs/promises";
import { expect, test } from "../fixtures/console-forward";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SEA-0001: page title search box", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        const ids = await TestHelpers.prepareTestEnvironment(page, testInfo);
        await TestHelpers.createTestPageViaAPI(page, "second-page", ["second page text"]);
        // navigate back to first page to ensure SearchBox appears (prefer Svelte-managed navigation)
        {
            const target = `/${encodeURIComponent(ids.projectName)}/${encodeURIComponent(ids.pageName)}`;
            const absoluteUrl = new URL(target, page.url()).toString();
            // Svelte 管理のナビゲーションのみを使用する
            await page.waitForFunction(() => !!(window as any).__SVELTE_GOTO__, { timeout: 30000 });
            await page.evaluate(async (u) => {
                const goto = (window as any).__SVELTE_GOTO__;
                await goto(u);
            }, absoluteUrl);
            await page.waitForURL(absoluteUrl, { timeout: 60000 });
        }
    });

    test("search box navigates to another page", async ({ page }, testInfo) => {
        // Capture browser console and page errors for diagnosing hydration issues
        page.on("console", (msg) => {
            console.log(`[browser:${msg.type()}]`, msg.text());
        });
        page.on("pageerror", (err) => {
            console.log("[browser:pageerror]", err?.message || String(err));
        });
        // a11y ツリーの事前スナップショットを保存（原因切り分け用）
        try {
            const ax = await page.accessibility.snapshot();
            if (ax) {
                await fs.writeFile(testInfo.outputPath("a11y-before-search.json"), JSON.stringify(ax, null, 2));
            }
        } catch {}

        // Toolbar の存在チェックと内部の input の探索
        try {
            const toolbar = page.locator('[data-testid="main-toolbar"]');
            await toolbar.waitFor({ state: "attached", timeout: 10_000 });
            const toolbarInfo = await toolbar.evaluate((el) => ({
                exists: !!el,
                htmlHead: el.innerHTML.slice(0, 120),
                childInputs: Array.from(el.querySelectorAll("input")).map(i => ({
                    id: i.id,
                    role: i.getAttribute("role"),
                    aria: i.getAttribute("aria-label"),
                    ph: i.getAttribute("placeholder"),
                })),
            }));
            console.log("🔧 [Diag] main-toolbar found:", toolbarInfo);
        } catch (e) {
            console.log("🔧 [Diag] main-toolbar not found in 10s:", String(e));
        }

        // CSSロケータで存在と可視性を検証＋詳細ログ
        try {
            const cssInput = page.locator("#search-pages-input");
            await cssInput.waitFor({ state: "attached", timeout: 10_000 });
            const info = await cssInput.evaluate((el) => {
                const cs = getComputedStyle(el);
                const r = el.getBoundingClientRect();
                const vw = innerWidth, vh = innerHeight;
                const cx = Math.max(0, Math.min(vw - 1, r.left + Math.min(r.width - 1, 5)));
                const cy = Math.max(0, Math.min(vh - 1, r.top + Math.min(r.height - 1, Math.floor(r.height / 2))));
                const center = document.elementFromPoint(cx, cy) as Element | null;
                return {
                    display: cs.display,
                    visibility: cs.visibility,
                    opacity: cs.opacity,
                    pointerEvents: cs.pointerEvents,
                    transform: cs.transform,
                    clipPath: (cs as any).clipPath ?? (cs as any)["clip-path"],
                    bbox: { x: r.x, y: r.y, w: r.width, h: r.height },
                    viewportIntersect: r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh,
                    centerEl: center
                        ? {
                            tag: center.tagName,
                            id: (center as HTMLElement).id,
                            cls: (center as HTMLElement).className,
                        }
                        : null,
                };
            });
            console.log("🔧 [Diag] #search-pages-input styles:", info);
            await cssInput.waitFor({ state: "visible", timeout: 10_000 });
            console.log("🔧 [Diag] #search-pages-input is visible via CSS locator");
        } catch (e) {
            console.log("🔧 [Diag] CSS locator visibility check failed:", String(e));
        }

        // 一時的な比較: 先祖スコープなしでの可視待機
        try {
            console.log("🔧 [Diag] Waiting unscoped textbox by role/name...");
            const unscoped = page.getByRole("textbox", { name: "Search pages" });
            await unscoped.waitFor({ state: "visible", timeout: 10_000 });
            console.log("🔧 [Diag] Unscoped textbox became visible");
        } catch (e) {
            console.log("🔧 [Diag] Unscoped textbox not visible in 10s:", String(e));
            try {
                const unscoped = page.getByRole("textbox", { name: "Search pages" });
                await unscoped.click({ trial: true, timeout: 2000 });
            } catch (e2) {
                console.log("🔧 [Diag] trial click error for unscoped textbox:", String(e2));
            }
        }

        // 仕様通りのロケータ（先祖スコープあり）
        const input = page
            .getByTestId("main-toolbar")
            .getByRole("textbox", { name: "Search pages" });

        // Playwright の可視安定待ちを明示
        await input.waitFor({ state: "visible", timeout: 20_000 });

        await input.focus();
        await input.fill("second");
        await page.waitForSelector(".page-search-box li");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(/second-page/);
    });
});
import "../utils/registerAfterEachSnapshot";
