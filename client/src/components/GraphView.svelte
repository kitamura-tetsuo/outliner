<script lang="ts">
import { goto } from "$app/navigation";
import * as echarts from "echarts";
import { onMount } from "svelte";
import { store } from "../stores/store.svelte";
import { buildGraph } from "../utils/graphUtils";

let graphDiv: HTMLDivElement;
let chart: echarts.ECharts | undefined;

function saveLayout() {
    if (!chart) return;
    try {
        const option = chart.getOption() as any;
        const nodes = option.series[0].data;

        // EChartsの内部状態から実際の位置を取得
        const layoutData = {
            nodes: nodes.map((n: any) => {
                // EChartsの内部状態から位置を取得
                const actualPosition = chart?.convertFromPixel({ seriesIndex: 0 }, [n.x || 0, n.y || 0]);
                return {
                    id: n.id,
                    x: n.x !== undefined ? n.x : (actualPosition ? actualPosition[0] : undefined),
                    y: n.y !== undefined ? n.y : (actualPosition ? actualPosition[1] : undefined),
                    fixed: n.fixed || false,
                };
            }).filter(n => n.x !== undefined && n.y !== undefined), // 位置が定義されているノードのみ保存
        };

        console.log("Saving layout data:", layoutData);
        localStorage.setItem("graph-layout", JSON.stringify(layoutData));
    }
    catch (error) {
        console.warn("Failed to save graph layout:", error);
    }
}

function loadLayout(nodes: any[]) {
    try {
        const savedLayout = localStorage.getItem("graph-layout");
        if (!savedLayout) return nodes;

        const layoutData = JSON.parse(savedLayout);
        console.log("Loading layout data:", layoutData);

        if (layoutData.nodes) {
            for (const savedNode of layoutData.nodes) {
                const node = nodes.find((n: any) => n.id === savedNode.id);
                if (node && savedNode.x !== undefined && savedNode.y !== undefined) {
                    node.x = savedNode.x;
                    node.y = savedNode.y;
                    node.fixed = savedNode.fixed || false;
                    console.log(`Restored layout for node ${node.id}: x=${node.x}, y=${node.y}, fixed=${node.fixed}`);
                }
            }
        }
        return nodes;
    }
    catch (error) {
        console.warn("Failed to load graph layout:", error);
        return nodes;
    }
}

function update() {
    if (!chart) return;

    // storeからデータを取得
    let pages: any[] = [];
    let project = "";

    if (Array.isArray(store.pages?.current)) {
        pages = store.pages.current;
        project = store.project?.title || "";
    }

    const { nodes, links } = buildGraph(pages, project);

    // 保存されたレイアウトを適用
    const nodesWithLayout = loadLayout(nodes);

    chart.setOption({
        tooltip: {},
        series: [{
            type: "graph",
            layout: "force",
            roam: true,
            data: nodesWithLayout,
            links,
            label: { position: "right" },
            force: {
                // 固定ノードの位置を尊重する設定
                initLayout: "circular",
                repulsion: 100,
                gravity: 0.1,
                edgeLength: 200,
                layoutAnimation: true,
            },
        }],
    });
}

onMount(() => {
    chart = echarts.init(graphDiv);
    (window as any).__GRAPH_CHART__ = chart;
    chart.on("click", (params: any) => {
        if (params.dataType === "node") {
            const pageName = params.data.name;
            const projectName = store.project?.title;
            if (projectName) {
                goto(`/${projectName}/${pageName}`);
            }
            else {
                goto(`/${pageName}`);
            }
        }
    });

    // ノードの位置が変更されたときにレイアウトを保存
    chart.on("finished", () => {
        // レイアウト計算完了後に少し待ってから保存
        setTimeout(() => {
            saveLayout();
        }, 100);
    });

    // ドラッグ終了時にも保存
    chart.on("brushEnd", () => {
        saveLayout();
    });

    update();
    return () => {
        chart?.dispose();
    };
    // 低頻度ポーリングで最新を反映（runes準拠）
    const timer = setInterval(() => { try { update(); } catch {} }, 500);
    return () => { clearInterval(timer); };
});
</script>

<div class="graph-view" bind:this={graphDiv} style="width: 100%; height: 400px"></div>
