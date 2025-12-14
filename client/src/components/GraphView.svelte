<script lang="ts">
import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import * as echarts from "echarts";
import type { ECElementEvent, GraphSeriesOption } from "echarts";
import { onMount } from "svelte";
import { store } from "../stores/store.svelte";
import { buildGraph } from "../utils/graphUtils";

let graphDiv: HTMLDivElement;
let chart: echarts.ECharts | undefined;

type GraphNodeWithLayout = {
    id: string;
    name: string;
    x?: number;
    y?: number;
    fixed?: boolean;
};

type GraphLayout = { nodes: Array<{ id: string; x: number; y: number; fixed?: boolean; }>; };
type GraphSeriesWithData = GraphSeriesOption & { data?: GraphNodeWithLayout[]; };

type YMapLike = { observeDeep?: (fn: () => void) => void; unobserveDeep?: (fn: () => void) => void; };

const toArray = <T>(value: unknown): T[] => {
    if (Array.isArray(value)) return value as T[];
    if (value && typeof (value as Iterable<unknown>)[Symbol.iterator] === "function") {
        return Array.from(value as Iterable<T>);
    }

    const length = (value as { length?: unknown; })?.length;
    if (typeof length === "number" && length >= 0) {
        const result: T[] = [];
        for (let i = 0; i < length; i++) {
            const fallbackValue = (value as { [key: number]: T; })[i];
            const atMethod = (value as { at?: (idx: number) => T; }).at;
            result.push(atMethod ? atMethod.call(value, i) : fallbackValue);
        }
        return result;
    }

    return [];
};

const getGraphNodesFromChart = (currentChart: echarts.ECharts): GraphNodeWithLayout[] => {
    const option = currentChart.getOption();
    const series = Array.isArray(option.series) ? option.series : [];
    const firstSeries = series[0] as GraphSeriesWithData | undefined;
    const data = firstSeries?.data;
    if (!Array.isArray(data)) return [];
    return data.filter((node): node is GraphNodeWithLayout => Boolean(node?.id));
};

function saveLayout() {
    if (!chart) return;
    try {
        const nodes = getGraphNodesFromChart(chart);

        // EChartsの内部状態から実際の位置を取得
        const layoutData = {
            nodes: nodes.map((node) => {
                // EChartsの内部状態から位置を取得
                const actualPosition = chart?.convertFromPixel(
                    { seriesIndex: 0 },
                    [node.x ?? 0, node.y ?? 0],
                );
                const [convertedX, convertedY] = Array.isArray(actualPosition) ? actualPosition : [undefined, undefined];
                return {
                    id: node.id,
                    x: node.x ?? convertedX,
                    y: node.y ?? convertedY,
                    fixed: node.fixed || false,
                };
            }).filter((node): node is GraphLayout["nodes"][number] => typeof node.x === "number" && typeof node.y === "number"), // 位置が定義されているノードのみ保存
        };

        console.log("Saving layout data:", layoutData);
        localStorage.setItem("graph-layout", JSON.stringify(layoutData));
    }
    catch (error) {
        console.warn("Failed to save graph layout:", error);
    }
}

function loadLayout(nodes: GraphNodeWithLayout[]): GraphNodeWithLayout[] {
    try {
        const savedLayout = localStorage.getItem("graph-layout");
        if (!savedLayout) return nodes;

        const layoutData = JSON.parse(savedLayout) as { nodes?: GraphLayout["nodes"]; };
        console.log("Loading layout data:", layoutData);

        if (layoutData.nodes) {
            const savedById = new Map(layoutData.nodes.map(node => [node.id, node]));
            return nodes.map(node => {
                const savedNode = savedById.get(node.id);
                if (savedNode && typeof savedNode.x === "number" && typeof savedNode.y === "number") {
                    console.log(`Restored layout for node ${node.id}: x=${savedNode.x}, y=${savedNode.y}, fixed=${savedNode.fixed || false}`);
                    return {
                        ...node,
                        x: savedNode.x,
                        y: savedNode.y,
                        fixed: savedNode.fixed || false,
                    };
                }
                return node;
            });
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

    const pages = toArray<{ id: string; text?: unknown; items?: unknown; }>(store.pages?.current || []);
    const project = store.project?.title || "";

    const { nodes, links } = buildGraph(pages, project);

    // 保存されたレイアウトを適用
    const nodesWithLayout = loadLayout(nodes as GraphNodeWithLayout[]);

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
    (window as unknown as { __GRAPH_CHART__?: echarts.ECharts; }).__GRAPH_CHART__ = chart;
    chart.on("click", (params: ECElementEvent) => {
        if (params.dataType === "node") {
            const pageName = typeof (params.data as { name?: unknown; })?.name === "string"
                ? (params.data as { name: string; }).name
                : "";
            if (!pageName) return;

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
        const ymap = (store.project as { ydoc?: { getMap?: (key: string) => unknown; }; })?.ydoc?.getMap?.("orderedTree") as YMapLike | undefined;
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
