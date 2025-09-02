// Fluid/Yjs スナップショットエクスポーター
// 目的: Fluid と Yjs のデータを「意味的に」正規化し、
// ID や作成時刻に依存しない厳密比較可能な JSON を生成する

import type { FluidClient } from "../fluid/fluidClient";
import type { Item, Items } from "../schema/app-schema";
import { getLogger } from "./logger";
import type { YjsProjectManager } from "./yjsProjectManager.svelte";

const logger = getLogger();

export interface NormalizedItem {
    text: string;
    children?: NormalizedItem[];
}

export interface NormalizedPage {
    title: string;
    items: NormalizedItem[];
}

export interface NormalizedSnapshot {
    projectTitle: string;
    pages: NormalizedPage[];
}

function normalizeFluidItems(items: any): NormalizedItem[] {
    // Fluidの Items は iterable であり、各 item に text と items がある
    if (!items) return [];
    const arr = [...(items as Items)];
    return arr.map(it => normalizeFluidItemRecursively(it));
}

function normalizeFluidItemRecursively(it: any): NormalizedItem {
    const node: NormalizedItem = { text: String(it.text ?? "") };
    const children = it.items ? [...it.items] : [];
    if (children.length > 0) {
        node.children = children.map((child: any) => normalizeFluidItemRecursively(child));
    }
    return node;
}

function normalizeYjsItems(treeManager: any, parentId: string = "root"): NormalizedItem[] {
    try {
        console.log("🔍 [SnapshotExport] normalizeYjsItems called for parentId:", parentId);

        const tree = treeManager.getTree();
        console.log("🔍 [SnapshotExport] tree obtained:", !!tree);

        const rawChildKeys = tree.getNodeChildrenFromKey(parentId);
        console.log("🔍 [SnapshotExport] rawChildKeys for", parentId, ":", rawChildKeys);

        const childKeys: string[] = tree.sortChildrenByOrder(rawChildKeys, parentId);
        console.log("🔍 [SnapshotExport] sortedChildKeys for", parentId, ":", childKeys);

        const items: NormalizedItem[] = [];
        for (const key of childKeys) {
            const value = tree.getNodeValueFromKey(key) as { text?: string; } | undefined;
            console.log("🔍 [SnapshotExport] Processing key:", key, "value:", value);

            const node: NormalizedItem = { text: String(value?.text ?? "") };
            const children = normalizeYjsItems(treeManager, key);
            if (children.length > 0) node.children = children;
            items.push(node);
        }

        console.log("🔍 [SnapshotExport] normalizeYjsItems result for", parentId, ":", items);
        return items;
    } catch (e) {
        console.error("🔍 [SnapshotExport] normalizeYjsItems failed for", parentId, ":", e);
        logger.error("normalizeYjsItems failed");
        return [];
    }
}

function normalizeYjsChildrenUnderTitle(treeManager: any, titleText: string): NormalizedItem[] {
    try {
        // ルート直下のノードを正規化し、タイトルノード以外を「子」として扱う
        const rootNodes = normalizeYjsItems(treeManager, "root");
        const children = rootNodes.filter(n => n.text !== titleText);
        return children;
    } catch (e) {
        logger.error("normalizeYjsChildrenUnderTitle failed");
        return [];
    }
}

export function exportFluidProjectSnapshot(fluidClient: FluidClient): NormalizedSnapshot {
    // Fluid プロジェクトの正規化スナップショット
    const project: any = typeof fluidClient.getProject === "function"
        ? fluidClient.getProject()
        : { title: "", items: [] };
    const pages: any[] = project?.items ? [...(project.items as Items)] : [];

    // ページは title で安定ソート（Yjs 側の order 差異の影響を排除）
    const normalizedPages: NormalizedPage[] = pages
        .map(p => {
            const title = String(p.text ?? "");
            // Fluidではページタイトルはitemsに含まれないため、仮想的にタイトルノードを先頭に置く
            const children = normalizeFluidItems(p.items);
            const items: NormalizedItem[] = [{ text: title, children: children.length > 0 ? children : undefined }];
            return { title, items };
        })
        .sort((a, b) => a.title.localeCompare(b.title));

    const snapshot: NormalizedSnapshot = {
        projectTitle: String(project?.title ?? ""),
        pages: normalizedPages,
    };
    return snapshot;
}

export async function exportYjsProjectSnapshot(yjsProjectManager: YjsProjectManager): Promise<NormalizedSnapshot> {
    // Yjs プロジェクトの正規化スナップショット
    console.log("🔍 [SnapshotExport] exportYjsProjectSnapshot called");

    const title = String(yjsProjectManager.getProjectTitle() ?? "");
    console.log("🔍 [SnapshotExport] Project title:", title);

    const pages = yjsProjectManager.getPages();
    console.log("🔍 [SnapshotExport] Pages found:", pages.length, pages);

    // ページのタイトルで安定ソート
    const sortedPages = [...pages].sort((a, b) => String(a.title).localeCompare(String(b.title)));
    console.log("🔍 [SnapshotExport] Sorted pages:", sortedPages);

    const normalizedPages: NormalizedPage[] = [];
    for (const page of sortedPages) {
        console.log("🔍 [SnapshotExport] Processing page:", page.id, page.title);

        const manager = await yjsProjectManager.connectToPage(page.id);
        console.log("🔍 [SnapshotExport] Connected to page manager:", !!manager);

        const pageTitle = String(page.title ?? "");
        const children = normalizeYjsChildrenUnderTitle(manager, pageTitle);
        console.log("🔍 [SnapshotExport] Children for page", pageTitle, ":", children);

        const items: NormalizedItem[] = [{ text: pageTitle, children: children.length > 0 ? children : undefined }];
        normalizedPages.push({ title: pageTitle, items });
    }

    console.log("🔍 [SnapshotExport] Final normalized pages:", normalizedPages);
    const result = { projectTitle: title, pages: normalizedPages };
    console.log("🔍 [SnapshotExport] Final result:", result);

    return result;
}

export function stringifySnapshot(snapshot: NormalizedSnapshot): string {
    // 決定的なJSON文字列（キー順も安定化）
    return JSON.stringify(snapshot);
}
