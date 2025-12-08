<script lang="ts">
import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import * as echarts from "echarts";
import { onMount } from "svelte";
import { store } from "../stores/store.svelte";
import { buildGraph } from "../utils/graphUtils";

// Type definitions for graph nodes
interface GraphNode {
    id: string;
    x?: number;
    y?: number;
    fixed?: boolean;
    name?: string;
    [key: string]: unknown;
}

interface GraphOption {
    series: Array<{
        data: GraphNode[];
        links?: Array<{ [key: string]: unknown }>;
    }>;
}

let graphDiv: HTMLDivElement;
let chart: echarts.ECharts | undefined;

function saveLayout() {
    if (!chart) return;
    try {
        const option = chart.getOption() as GraphOption;
        const nodes = option.series[0].data;

        // EChartsの内部状態から実際の位置を取得
        const layoutData = {
            nodes: nodes.map((n: GraphNode) => {
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

function loadLayout(nodes: GraphNode[]) {
    try {
        const savedLayout = localStorage.getItem("graph-layout");
        if (!savedLayout) return nodes;

        const layoutData = JSON.parse(savedLayout);
        console.log("Loading layout data:", layoutData);

        if (layoutData.nodes) {
            for (const savedNode of layoutData.nodes) {
                const node = nodes.find((n: GraphNode) => n.id === savedNode.id);
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

    // storeからデータを取得（Yjs Items 互換: 配列/Iterable/Array-like を許容）
    const toArray = (p: unknown): GraphNode[] => {
        try {
            if (Array.isArray(p)) return p as GraphNode[];
            if (p && typeof (p as { [Symbol.iterator]: () => Iterator<unknown> })[Symbol.iterator] === "function") {
                return Array.from(p as unknown as ArrayLike<unknown>) as GraphNode[];
            }
            const len = (p as { length?: number })?.length;
            if (typeof len === "number" && len >= 0) {
                const r: GraphNode[] = [];
                for (let i = 0; i < len; i++) r.push((p as { at?: (i: number) => unknown; [i: number]: unknown }).at ? (p as { at: (i: number) => unknown }).at(i) : (p as { [i: number]: unknown })[i]) as GraphNode;
                return r;
            }
        } catch {}
        return [];
    };

    const pages = toArray(store.pages?.current || []);
    const project = store.project?.title || "";

    const { nodes, links } = buildGraph(pages, project);

    // 保存されたレイアウトを適用
    const nodesWithLayout = loadLayout(nodes);

    chart.setOption({
        tooltip: {},
        series: [{
            type: "graph",
            layout: "force",
            roam: true,
            data: nodesWithLayout as GraphNode[],
            links: links as Array<{ [key: string]: unknown }>,
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
    (window as unknown).__GRAPH_CHART__ = chart;
    chart.on("click", (params: { dataType: string; data: GraphNode }) => {
        if (params.dataType === "node") {
            const pageName = params.data.name;
            const projectName = store.project?.title;
            if (projectName) {
                goto(resolve(`/${projectName}/${pageName}`));
            }
            else {
                goto(resolve(`/${pageName}`));
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

    // Initial render
    update();

    // React to project structure changes via minimal-granularity Yjs observeDeep on orderedTree
    let detachDocListener: (() => void) | undefined;
    try {
        const ymap = (store.project as { ydoc?: { getMap?: (name: string) => { observeDeep?: (handler: () => void) => void; unobserveDeep?: (handler: () => void) => void } } })?.ydoc?.getMap?.("orderedTree");
        if (ymap && typeof ymap.observeDeep === "function") {
            const handler = () => { try { update(); } catch {} };
            ymap.observeDeep(handler);
            detachDocListener = () => { try { ymap.unobserveDeep(handler); } catch {} };
        }
    } catch {}

    // Keep chart sized correctly on container resizes
    const onResize = () => { try { chart?.resize(); } catch {} };
    window.addEventListener("resize", onResize);

    return () => {
        detachDocListener?.();
        window.removeEventListener("resize", onResize);
        chart?.dispose();
    };
});
</script>

<div class="graph-view" bind:this={graphDiv} style="width: 100%; height: 400px"></div>
