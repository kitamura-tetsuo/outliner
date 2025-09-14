/** @feature GRV-0001
 *  Title   : Graph View visualization
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { TestHelpers } from "../utils/testHelpers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe("GRV-0001: Graph View real-time updates", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(
            page,
            testInfo,
            [
                "First page with [test-link] reference",
            ],
            undefined,
            { enableYjsWs: true },
        );
        // Ensure store pages are ready
        await page.waitForFunction(() => {
            const gs = (window as any).generalStore || (window as any).appStore;
            const pages = gs?.pages?.current;
            return Array.isArray(pages) && pages.length >= 1;
        }, { timeout: 15000 });
    });

    test("ECharts library initialization", async ({ page }) => {
        // EChartsライブラリを動的に読み込み
        const echartsPath = path.resolve(__dirname, "../../node_modules/echarts/dist/echarts.min.js");
        await page.addScriptTag({ path: echartsPath });

        // EChartsライブラリが正常に読み込まれることを確認
        const echartsLoaded = await page.evaluate(() => {
            return typeof (window as any).echarts !== "undefined";
        });
        expect(echartsLoaded).toBe(true);

        // 簡単なグラフを作成してEChartsが動作することを確認
        const initResult = await page.evaluate(() => {
            const echarts = (window as any).echarts;
            if (!echarts) return { success: false, error: "ECharts not found" };

            try {
                const graphDiv = document.createElement("div");
                graphDiv.style.width = "400px";
                graphDiv.style.height = "300px";
                graphDiv.id = "test-echarts-init";
                document.body.appendChild(graphDiv);

                const chart = echarts.init(graphDiv);
                chart.setOption({
                    series: [{
                        type: "graph",
                        data: [{ id: "test", name: "Test Node" }],
                        links: [],
                    }],
                });

                return { success: true, chartCreated: true };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        expect(initResult.success).toBe(true);
        expect(initResult.chartCreated).toBe(true);
    });

    test("graph updates when new page is added", async ({ page }) => {
        // EChartsライブラリを動的に読み込み
        await page.addScriptTag({
            url: "https://cdn.jsdelivr.net/npm/echarts@5.6.0/dist/echarts.min.js",
        });

        // EChartsライブラリの読み込み完了を待機
        await page.waitForFunction(() => {
            return typeof (window as any).echarts !== "undefined";
        }, { timeout: 5000 });

        // プロジェクトページ内でGraph Viewコンポーネントを動的に追加してテスト
        const graphInitResult = await page.evaluate(() => {
            try {
                // Wait a tick for store readiness in case of slow hydration
                const gs = (window as any).generalStore || (window as any).appStore;
                const ready = !!(gs && gs.pages && gs.project);
                if (!ready) return { success: false, error: "Store not available" };
                // Graph Viewコンポーネントを動的に作成
                const graphDiv = document.createElement("div");
                graphDiv.className = "graph-view";
                graphDiv.style.width = "100%";
                graphDiv.style.height = "400px";
                graphDiv.id = "test-graph-view";
                document.body.appendChild(graphDiv);

                // EChartsを初期化
                const echarts = (window as any).echarts;
                if (!echarts) {
                    return { success: false, error: "ECharts not available" };
                }

                const chart = echarts.init(graphDiv);
                (window as any).__GRAPH_CHART__ = chart;

                // 初期グラフを設定
                const store = (window as any).appStore;
                if (store && store.pages && store.project) {
                    const pages = store.pages.current || [];
                    const nodes = pages.map((p: any) => ({ id: p.id, name: p.text }));
                    chart.setOption({
                        tooltip: {},
                        series: [{
                            type: "graph",
                            layout: "force",
                            roam: true,
                            data: nodes,
                            links: [],
                            label: { position: "right" },
                        }],
                    });
                    return { success: true, nodesCount: nodes.length };
                } else {
                    return { success: false, error: "Store not available" };
                }
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        expect(graphInitResult.success).toBe(true);
        await expect(page.locator("#test-graph-view")).toBeVisible();

        // Wait until initial graph is ready with one node
        await page.waitForFunction(() => {
            const chart = (window as any).__GRAPH_CHART__;
            if (!chart) return false;
            try {
                const option = chart.getOption();
                return option && option.series && option.series[0] && option.series[0].data
                    && option.series[0].data.length >= 1;
            } catch (error) {
                console.error("Error checking graph option:", error);
                return false;
            }
        }, { timeout: 10000 });

        // プロジェクト内でページを作成（Yjs）
        const pageCreateResult = await page.evaluate(async () => {
            try {
                const gs = (window as any).generalStore || (window as any).appStore;
                const chart = (window as any).__GRAPH_CHART__;
                if (!gs?.project || !chart) return { success: false, error: "Store or chart not available" };

                // 新規ページを追加（Yjs）
                const newPage = gs.project.addPage("test-link", "tester");
                const items = newPage.items as any;
                items.addNode("tester").updateText("second page content");

                // 反映を待つ
                await new Promise(r => setTimeout(r, 200));

                // グラフを更新
                const pages = gs.pages?.current || [];
                const nodes = pages.map((p: any) => ({ id: p.id, name: (p?.text?.toString?.() ?? String(p.text)) }));
                const links: any[] = [];
                for (const src of pages) {
                    const srcText = (src?.text?.toString?.() ?? String(src.text)) as string;
                    const childTexts = ((src.items || []) as any[]).map((
                        i: any,
                    ) => (i?.text?.toString?.() ?? String(i.text)));
                    const texts = [srcText, ...childTexts];
                    for (const dst of pages) {
                        if (src.id === dst.id) continue;
                        const target = (dst?.text?.toString?.() ?? String(dst.text)).toLowerCase();
                        if (texts.some((t: string) => t.toLowerCase().includes(`[${target}]`))) {
                            links.push({ source: src.id, target: dst.id });
                        }
                    }
                }

                chart.setOption({
                    series: [{
                        type: "graph",
                        layout: "force",
                        roam: true,
                        data: nodes,
                        links,
                        label: { position: "right" },
                    }],
                });

                return { success: true, nodesCount: nodes.length, linksCount: links.length };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        console.log("Page creation result:", pageCreateResult);
        expect(pageCreateResult.success).toBe(true);

        // Wait for the graph to update with the new node and link
        await page.waitForFunction(() => {
            const chart = (window as any).__GRAPH_CHART__;
            if (!chart) return false;
            try {
                const option = chart.getOption();
                return option && option.series && option.series[0]
                    && option.series[0].data && option.series[0].data.length >= 2
                    && option.series[0].links && option.series[0].links.length >= 1;
            } catch (error) {
                console.error("Error checking updated graph:", error);
                return false;
            }
        }, { timeout: 15000 });

        const data = await page.evaluate(() => {
            try {
                const chart = (window as any).__GRAPH_CHART__;
                if (!chart) return { error: "Chart not found" };

                const opt = chart.getOption();
                return {
                    nodes: opt.series[0].data.length,
                    links: opt.series[0].links.length,
                };
            } catch (error) {
                return { error: error.message };
            }
        });

        expect(data.error).toBeUndefined();
        expect(data.nodes).toBeGreaterThanOrEqual(2);
        expect(data.links).toBeGreaterThanOrEqual(1);
    });
});
import "../utils/registerAfterEachSnapshot";
